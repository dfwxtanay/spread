"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedStatus } from "@/lib/feeds/types";
import { formatNumber, formatPercent } from "@/lib/format";
import { getMarket, MARKETS } from "@/lib/markets";
import { feedName, selectMarket, startMarket, toggleBatching, toggleLoadTest, useMarket } from "@/lib/store";
import { OrderBook } from "./OrderBook";
import { MarketList, PerformancePanel, TradesFeed } from "./Panels";
import { PriceChart } from "./PriceChart";

const STATUS_COPY: Record<FeedStatus["state"], string> = {
  connecting: "Connecting",
  live: "Live",
  stale: "Waiting for data",
  reconnecting: "Reconnecting",
};

function StatusBadge() {
  const status = useMarket((state) => state.status);
  return (
    <span className={`status status--${status.state}`} role="status">
      <i aria-hidden="true" />
      {STATUS_COPY[status.state]}
    </span>
  );
}

function Headline() {
  const symbol = useMarket((state) => state.symbol);
  const ticker = useMarket((state) => state.tickers[symbol]);
  const market = getMarket(symbol);
  const change = ticker ? ((ticker.price - ticker.open) / ticker.open) * 100 : 0;

  return (
    <div className="headline">
      <strong>{market.base}/USDT</strong>
      <span>{ticker ? formatNumber(ticker.price, market.priceDecimals) : "--"}</span>
      {ticker && <small className={change < 0 ? "is-down" : "is-up"}>{formatPercent(change)}</small>}
    </div>
  );
}

function ConnectionBanner() {
  const status = useMarket((state) => state.status);
  if (status.state !== "reconnecting" && status.state !== "stale") return null;
  return (
    <p className="banner" role="alert">
      {status.state === "stale"
        ? "The feed has gone quiet. Showing the last known prices."
        : `Connection lost. Showing the last known prices. Retry ${status.attempt} in ${(status.retryInMs / 1000).toFixed(1)} s.`}
    </p>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return MARKETS.filter((market) => `${market.base} ${market.name}`.toLowerCase().includes(term));
  }, [query]);

  useEffect(() => inputRef.current?.focus(), []);

  const choose = (symbol: string) => {
    selectMarket(symbol);
    onClose();
  };

  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label="Search markets" onMouseDown={onClose}>
      <div className="palette__box" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          placeholder="Search markets"
          aria-label="Search markets"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && results[active]) {
              choose(results[active].symbol);
            }
          }}
        />
        <ul>
          {results.map((market, index) => (
            <li key={market.symbol}>
              <button
                type="button"
                className={index === active ? "is-active" : undefined}
                onClick={() => choose(market.symbol)}
              >
                <strong>{market.base}</strong> {market.name}
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="palette__empty">No matching markets</li>}
        </ul>
      </div>
    </div>
  );
}

export function Terminal() {
  const symbol = useMarket((state) => state.symbol);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => startMarket(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === "Escape") setPaletteOpen(false);
      if (paletteOpen || event.metaKey || event.ctrlKey) return;

      const index = MARKETS.findIndex((market) => market.symbol === symbol);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectMarket(MARKETS[(index + 1) % MARKETS.length].symbol);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectMarket(MARKETS[(index - 1 + MARKETS.length) % MARKETS.length].symbol);
      } else if (event.key.toLowerCase() === "b") {
        toggleBatching();
      } else if (event.key.toLowerCase() === "l") {
        toggleLoadTest();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, symbol]);

  return (
    <div className="terminal">
      <header className="topbar">
        <h1>SPREAD<sup>*</sup></h1>
        <Headline />
        <button type="button" className="search" onClick={() => setPaletteOpen(true)}>
          Search markets <kbd>&#8984;K</kbd>
        </button>
        <span className="source">{feedName}</span>
        <StatusBadge />
      </header>
      <ConnectionBanner />
      <main className="grid">
        <MarketList />
        <PriceChart />
        <OrderBook />
        <TradesFeed />
        <PerformancePanel />
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
