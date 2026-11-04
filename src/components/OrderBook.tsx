"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import type { Level } from "@/lib/feeds/types";
import { formatNumber } from "@/lib/format";
import { getMarket } from "@/lib/markets";
import { useMarket } from "@/lib/store";

const VISIBLE_LEVELS = 20;
const FLASH_GAP_MS = 250;

type RowProps = {
  side: "bid" | "ask";
  price: number;
  size: number;
  total: number;
  maxTotal: number;
  priceDecimals: number;
  sizeDecimals: number;
};

// memo keeps unchanged levels out of the render, which matters at 10 updates a second.
const Row = memo(function Row({ side, price, size, total, maxTotal, priceDecimals, sizeDecimals }: RowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const previousSize = useRef(size);
  const lastFlash = useRef(0);

  useLayoutEffect(() => {
    if (previousSize.current === size) return;
    const grew = size > previousSize.current;
    previousSize.current = size;
    // Stacking animations on a busy row costs frames, so flash it at most four times a second.
    const now = performance.now();
    if (now - lastFlash.current < FLASH_GAP_MS) return;
    lastFlash.current = now;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The Web Animations API flashes the row without another React render.
    rowRef.current?.animate(
      [{ backgroundColor: grew ? "var(--flash-up)" : "var(--flash-down)" }, { backgroundColor: "transparent" }],
      { duration: 320, easing: "ease-out" },
    );
  }, [size]);

  return (
    <div className={`book__row book__row--${side}`} ref={rowRef}>
      <span className="book__depth" style={{ transform: `scaleX(${maxTotal ? total / maxTotal : 0})` }} />
      <span className="book__price">{formatNumber(price, priceDecimals)}</span>
      <span>{formatNumber(size, sizeDecimals)}</span>
      <span className="book__total">{formatNumber(total, sizeDecimals)}</span>
    </div>
  );
});

function withTotals(levels: Level[]) {
  let total = 0;
  return levels.slice(0, VISIBLE_LEVELS).map((level) => {
    total += level.size;
    return { ...level, total };
  });
}

export function OrderBook() {
  const book = useMarket((state) => state.book);
  const symbol = useMarket((state) => state.symbol);
  const market = getMarket(symbol);

  const { bids, asks, maxTotal, spread, spreadBps } = useMemo(() => {
    const bids = withTotals(book?.bids ?? []);
    const asks = withTotals(book?.asks ?? []);
    const maxTotal = Math.max(bids.at(-1)?.total ?? 0, asks.at(-1)?.total ?? 0);
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const spread = bestAsk - bestBid;
    return { bids, asks, maxTotal, spread, spreadBps: bestBid ? (spread / bestBid) * 10000 : 0 };
  }, [book]);

  const rowProps = { maxTotal, priceDecimals: market.priceDecimals, sizeDecimals: market.sizeDecimals };

  return (
    <section className="panel book" aria-label={`${market.base} order book`}>
      <header className="panel__head">
        <h2>Order book</h2>
        <span>Top {VISIBLE_LEVELS} levels</span>
      </header>
      <div className="book__columns">
        <span>Price (USDT)</span>
        <span>Size ({market.base})</span>
        <span>Total</span>
      </div>
      {!book ? (
        <div className="book__skeleton" aria-label="Loading order book" />
      ) : (
        <div className="book__body">
          <div className="book__side book__side--asks">
            {[...asks].reverse().map((level) => (
              <Row key={level.price} side="ask" {...level} {...rowProps} />
            ))}
          </div>
          <div className="book__spread">
            <span>Spread</span>
            <strong>{formatNumber(spread, market.priceDecimals)}</strong>
            <span>{spreadBps.toFixed(3)} bps</span>
          </div>
          <div className="book__side">
            {bids.map((level) => (
              <Row key={level.price} side="bid" {...level} {...rowProps} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
