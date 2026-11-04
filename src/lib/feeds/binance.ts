import { MARKETS } from "../markets";
import type { Book, FeedHandlers, Level, MarketFeed, PricePoint } from "./types";

// Two public hosts: if one is unreachable, the next attempt rotates to the other.
const SOCKET_HOSTS = ["stream.binance.com:9443", "data-stream.binance.vision"];
const REST_HOSTS = ["api.binance.com", "data-api.binance.vision"];

const BOOK_DEPTH = 20;
const STALE_AFTER_MS = 2500;
const RECONNECT_AFTER_MS = 6000;
const MAX_BACKOFF_MS = 15000;

type RawLevel = [string, string];
type StreamMessage = { stream?: string; data?: Record<string, unknown> };

const toLevels = (raw: RawLevel[]): Level[] =>
  raw.map(([price, size]) => ({ price: Number(price), size: Number(size) }));

const marketStreams = (symbol: string) => {
  const lower = symbol.toLowerCase();
  return [`${lower}@depth${BOOK_DEPTH}@100ms`, `${lower}@trade`];
};

const tickerStreams = MARKETS.map((m) => `${m.symbol.toLowerCase()}@miniTicker`);

export class BinanceFeed implements MarketFeed {
  readonly name = "Binance Spot";

  private socket: WebSocket | null = null;
  private handlers: FeedHandlers | null = null;
  private symbol = "";
  private hostIndex = 0;
  private attempt = 0;
  private lastMessageAt = 0;
  private requestId = 1;
  private stale = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  connect(symbol: string, handlers: FeedHandlers) {
    this.symbol = symbol;
    this.handlers = handlers;
    this.open();
    this.watchdog = setInterval(() => this.checkSilence(), 1000);
  }

  setMarket(symbol: string) {
    const previous = this.symbol;
    this.symbol = symbol;
    if (this.socket?.readyState !== WebSocket.OPEN) return; // open() uses this.symbol
    this.send("UNSUBSCRIBE", marketStreams(previous));
    this.send("SUBSCRIBE", marketStreams(symbol));
  }

  disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.closeSocket();
    this.handlers = null;
  }

  dropConnection() {
    this.closeSocket();
    this.scheduleReconnect();
  }

  async history(symbol: string, signal: AbortSignal): Promise<PricePoint[]> {
    for (const host of REST_HOSTS) {
      try {
        const url = `https://${host}/api/v3/klines?symbol=${symbol}&interval=1s&limit=300`;
        const response = await fetch(url, { signal });
        if (!response.ok) continue;
        const rows: [number, string, string, string, string][] = await response.json();
        return rows.map((row) => ({ time: row[0], price: Number(row[4]) }));
      } catch (error) {
        if (signal.aborted) throw error;
      }
    }
    return []; // The chart still fills in from live trades.
  }

  private open() {
    const host = SOCKET_HOSTS[this.hostIndex % SOCKET_HOSTS.length];
    const streams = [...marketStreams(this.symbol), ...tickerStreams].join("/");
    const socket = new WebSocket(`wss://${host}/stream?streams=${streams}`);
    this.socket = socket;
    this.handlers?.onStatus({ state: "connecting", attempt: this.attempt });

    socket.onopen = () => {
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.stale = false;
      this.handlers?.onStatus({ state: "live", host });
    };
    socket.onmessage = (event) => this.handleMessage(event.data as string, host);
    socket.onclose = () => {
      if (this.socket === socket) this.scheduleReconnect();
    };
  }

  private handleMessage(raw: string, host: string) {
    this.lastMessageAt = Date.now();
    if (this.stale) {
      this.stale = false;
      this.handlers?.onStatus({ state: "live", host });
    }

    const { stream, data } = JSON.parse(raw) as StreamMessage;
    if (!stream || !data || !this.handlers) return;

    const [name, channel] = stream.split("@");
    const symbol = name.toUpperCase();

    if (channel === "miniTicker") {
      this.handlers.onTicker(symbol, { price: Number(data.c), open: Number(data.o) });
      return;
    }
    if (symbol !== this.symbol) return; // Late message from the previous market.

    if (channel === "trade") {
      this.handlers.onTrade(symbol, {
        id: data.t as number,
        price: Number(data.p),
        size: Number(data.q),
        time: data.T as number,
        side: data.m ? "sell" : "buy", // m = the buyer was the resting order
      });
    } else if (channel.startsWith("depth")) {
      const book: Book = {
        bids: toLevels(data.bids as RawLevel[]),
        asks: toLevels(data.asks as RawLevel[]),
      };
      this.handlers.onBook(symbol, book);
    }
  }

  private checkSilence() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const silentMs = Date.now() - this.lastMessageAt;
    if (silentMs >= RECONNECT_AFTER_MS) {
      this.dropConnection();
    } else if (silentMs >= STALE_AFTER_MS) {
      this.stale = true;
      this.handlers?.onStatus({ state: "stale", silentMs });
    }
  }

  private scheduleReconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket = null;
    this.hostIndex += 1;
    this.attempt += 1;
    const retryInMs = Math.min(MAX_BACKOFF_MS, 400 * 2 ** this.attempt) + Math.random() * 250;
    this.handlers?.onStatus({ state: "reconnecting", attempt: this.attempt, retryInMs });
    this.retryTimer = setTimeout(() => this.open(), retryInMs);
  }

  private closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onclose = null;
    socket.onmessage = null;
    socket.close();
  }

  private send(method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]) {
    this.socket?.send(JSON.stringify({ method, params, id: this.requestId++ }));
  }
}
