import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { BinanceFeed } from "./feeds/binance";
import type { Book, FeedStatus, MarketFeed, PricePoint, Ticker, Trade } from "./feeds/types";
import { DEFAULT_SYMBOL } from "./markets";

const MAX_TRADES = 60;
const MAX_POINTS = 600;
const POINT_INTERVAL_MS = 1000;

// The load test adds 500 simulated book updates a second, so the effect of
// batching is visible even when the real market is quiet.
const LOAD_TICK_MS = 20;
const LOAD_UPDATES_PER_TICK = 10;

export type Metrics = {
  messagesPerSec: number;
  commitsPerSec: number;
  commitMs: number;
  fps: number;
};

export type MarketState = {
  symbol: string;
  status: FeedStatus;
  book: Book | null;
  trades: Trade[];
  tickers: Record<string, Ticker>;
  metrics: Metrics;
  batching: boolean;
  loadTest: boolean;
};

const initialState: MarketState = {
  symbol: DEFAULT_SYMBOL,
  status: { state: "connecting", attempt: 0 },
  book: null,
  trades: [],
  tickers: {},
  metrics: { messagesPerSec: 0, commitsPerSec: 0, commitMs: 0, fps: 0 },
  batching: true,
  loadTest: false,
};

const feed: MarketFeed = new BinanceFeed();
const listeners = new Set<() => void>();

let state = initialState;

// Socket messages land here first. Nothing reaches React until commit() runs.
let pendingBook: Book | null = null;
let pendingTrades: Trade[] = [];
let pendingTickers: Record<string, Ticker> = {};
let frameRequested = false;

// The chart reads these directly on its own animation frame, bypassing React.
let series: PricePoint[] = [];
let seriesVersion = 0;

let messageCount = 0;
let commitCount = 0;
let frameCount = 0;
let commitMs = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<MarketState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** Re-renders only when the selected slice changes identity. */
export function useMarket<T>(selector: (state: MarketState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(initialState),
  );
}

function appendToSeries(trades: Trade[]) {
  for (const trade of trades) {
    const last = series[series.length - 1];
    if (last && trade.time - last.time < POINT_INTERVAL_MS) {
      last.price = trade.price;
    } else {
      series.push({ time: trade.time, price: trade.price });
    }
  }
  if (series.length > MAX_POINTS) series = series.slice(-MAX_POINTS);
  seriesVersion += 1;
}

function commit() {
  frameRequested = false;
  const patch: Partial<MarketState> = {};

  if (pendingBook) {
    patch.book = pendingBook;
    pendingBook = null;
  }
  if (pendingTrades.length) {
    appendToSeries(pendingTrades);
    patch.trades = [...pendingTrades.reverse(), ...state.trades].slice(0, MAX_TRADES);
    pendingTrades = [];
  }
  if (Object.keys(pendingTickers).length) {
    patch.tickers = { ...state.tickers, ...pendingTickers };
    pendingTickers = {};
  }
  if (Object.keys(patch).length === 0) return;

  // flushSync makes React render inside this call, so the timer measures the
  // real render and commit, and it also works in production builds.
  const start = performance.now();
  flushSync(() => setState(patch));
  const elapsed = performance.now() - start;
  commitMs = commitMs === 0 ? elapsed : commitMs * 0.9 + elapsed * 0.1;
  commitCount += 1;
}

function schedule() {
  messageCount += 1;
  if (!state.batching) {
    commit();
    return;
  }
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(commit);
}

async function loadHistory(symbol: string, signal: AbortSignal) {
  try {
    const history = await feed.history(symbol, signal);
    if (symbol !== state.symbol) return;
    // Live trades may already have arrived, so keep them after the history.
    const firstLive = series[0]?.time ?? Infinity;
    series = [...history.filter((point) => point.time < firstLive), ...series];
    seriesVersion += 1;
  } catch {
    // Aborted by a market switch, or both hosts failed: live trades fill the chart.
  }
}

let historyRequest: AbortController | null = null;
let loadTimer: ReturnType<typeof setInterval> | null = null;

function requestHistory(symbol: string) {
  historyRequest?.abort();
  historyRequest = new AbortController();
  void loadHistory(symbol, historyRequest.signal);
}

export function getSeries() {
  return { points: series, version: seriesVersion };
}

export function selectMarket(symbol: string) {
  if (symbol === state.symbol) return;
  pendingBook = null;
  pendingTrades = [];
  series = [];
  seriesVersion += 1;
  setState({ symbol, book: null, trades: [] });
  feed.setMarket(symbol);
  requestHistory(symbol);
}

export function toggleBatching() {
  setState({ batching: !state.batching });
}

function jitter(levels: Book["bids"]) {
  return levels.map((level) => ({ ...level, size: level.size * (0.9 + Math.random() * 0.2) }));
}

function stopLoadTest() {
  if (loadTimer) clearInterval(loadTimer);
  loadTimer = null;
}

export function toggleLoadTest() {
  if (state.loadTest) {
    stopLoadTest();
    setState({ loadTest: false });
    return;
  }
  setState({ loadTest: true });
  loadTimer = setInterval(() => {
    for (let update = 0; update < LOAD_UPDATES_PER_TICK; update += 1) {
      const book = pendingBook ?? state.book;
      if (!book) return;
      pendingBook = { bids: jitter(book.bids), asks: jitter(book.asks) };
      schedule();
    }
  }, LOAD_TICK_MS);
}

export function dropConnection() {
  feed.dropConnection();
}

export const feedName = feed.name;

/** Starts the socket and metrics. Returns a cleanup function. */
export function startMarket() {
  feed.connect(state.symbol, {
    onBook: (symbol, book) => {
      if (symbol !== state.symbol) return;
      pendingBook = book;
      schedule();
    },
    onTrade: (symbol, trade) => {
      if (symbol !== state.symbol) return;
      pendingTrades.push(trade);
      // A hidden tab pauses animation frames, so keep this buffer bounded.
      if (pendingTrades.length > MAX_TRADES) pendingTrades.shift();
      schedule();
    },
    onTicker: (symbol, ticker) => {
      pendingTickers[symbol] = ticker;
      schedule();
    },
    onStatus: (status) => setState({ status }),
  });
  requestHistory(state.symbol);

  let frameId = requestAnimationFrame(function countFrame() {
    frameCount += 1;
    frameId = requestAnimationFrame(countFrame);
  });

  const metricsTimer = setInterval(() => {
    setState({
      metrics: {
        messagesPerSec: messageCount,
        commitsPerSec: commitCount,
        commitMs,
        fps: frameCount,
      },
    });
    messageCount = 0;
    commitCount = 0;
    frameCount = 0;
  }, 1000);

  return () => {
    cancelAnimationFrame(frameId);
    clearInterval(metricsTimer);
    stopLoadTest();
    historyRequest?.abort();
    feed.disconnect();
  };
}
