"use client";

import { memo } from "react";
import type { Trade } from "@/lib/feeds/types";
import { formatNumber, formatPercent, formatTime } from "@/lib/format";
import { getMarket, MARKETS, type Market } from "@/lib/markets";
import { dropConnection, selectMarket, toggleBatching, toggleLoadTest, useMarket } from "@/lib/store";

const MarketRow = memo(function MarketRow({ market, active }: { market: Market; active: boolean }) {
  const ticker = useMarket((state) => state.tickers[market.symbol]);
  const change = ticker ? ((ticker.price - ticker.open) / ticker.open) * 100 : null;

  return (
    <button
      type="button"
      className="market"
      aria-current={active ? "true" : undefined}
      onClick={() => selectMarket(market.symbol)}
    >
      <span className="market__name">
        <strong>{market.base}</strong>
        <small>{market.name}</small>
      </span>
      <span className="market__price">
        <span>{ticker ? formatNumber(ticker.price, market.priceDecimals) : "--"}</span>
        <small className={change !== null && change < 0 ? "is-down" : "is-up"}>
          {change === null ? "--" : formatPercent(change)}
        </small>
      </span>
    </button>
  );
});

export function MarketList() {
  const symbol = useMarket((state) => state.symbol);
  return (
    <nav className="panel markets" aria-label="Markets">
      <header className="panel__head">
        <h2>Markets</h2>
        <span>24h</span>
      </header>
      <div className="markets__list">
        {MARKETS.map((market) => (
          <MarketRow key={market.symbol} market={market} active={market.symbol === symbol} />
        ))}
      </div>
      <p className="markets__hint">
        <kbd>&uarr;</kbd> <kbd>&darr;</kbd> switch market
      </p>
    </nav>
  );
}

const TradeRow = memo(function TradeRow({ trade, market }: { trade: Trade; market: Market }) {
  return (
    <li className={`trade trade--${trade.side}`}>
      <span>{formatNumber(trade.price, market.priceDecimals)}</span>
      <span>{formatNumber(trade.size, market.sizeDecimals)}</span>
      <time>{formatTime(trade.time)}</time>
    </li>
  );
});

export function TradesFeed() {
  const trades = useMarket((state) => state.trades);
  const symbol = useMarket((state) => state.symbol);
  const market = getMarket(symbol);

  return (
    <section className="panel trades" aria-label="Recent trades">
      <header className="panel__head">
        <h2>Recent trades</h2>
        <span>Live</span>
      </header>
      <div className="trades__columns">
        <span>Price</span>
        <span>Size</span>
        <span>Time</span>
      </div>
      <ol className="trades__list">
        {trades.map((trade) => (
          <TradeRow key={trade.id} trade={trade} market={market} />
        ))}
      </ol>
    </section>
  );
}

export function PerformancePanel() {
  const metrics = useMarket((state) => state.metrics);
  const batching = useMarket((state) => state.batching);
  const loadTest = useMarket((state) => state.loadTest);

  return (
    <section className="panel perf" aria-label="Performance">
      <header className="panel__head">
        <h2>Performance</h2>
        <span>{loadTest ? "Simulated load: +500/s" : "Measured live"}</span>
      </header>
      <dl className="perf__grid">
        <div>
          <dt>Messages/s</dt>
          <dd>{metrics.messagesPerSec}</dd>
        </div>
        <div>
          <dt>UI commits/s</dt>
          <dd>{metrics.commitsPerSec}</dd>
        </div>
        <div>
          <dt>Commit time</dt>
          <dd>{metrics.commitMs.toFixed(2)} ms</dd>
        </div>
        <div>
          <dt>Frame rate</dt>
          <dd>{metrics.fps} fps</dd>
        </div>
      </dl>
      <div className="perf__actions">
        <button type="button" aria-pressed={batching} onClick={toggleBatching}>
          Batching: {batching ? "On" : "Off"} <kbd>B</kbd>
        </button>
        <button type="button" aria-pressed={loadTest} onClick={toggleLoadTest}>
          Load test <kbd>L</kbd>
        </button>
        <button type="button" onClick={dropConnection}>
          Drop feed
        </button>
      </div>
    </section>
  );
}
