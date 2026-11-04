"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber, formatTime } from "@/lib/format";
import { getMarket } from "@/lib/markets";
import { getSeries, useMarket } from "@/lib/store";

const COLORS = {
  line: "#EFE7DA",
  fillTop: "rgba(178, 58, 74, 0.34)",
  fillBottom: "rgba(178, 58, 74, 0)",
  grid: "rgba(239, 231, 218, 0.07)",
  label: "rgba(239, 231, 218, 0.62)",
  last: "#E0586C",
};
const AXIS_WIDTH = 74;
const PADDING_Y = 18;

export function PriceChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverX = useRef<number | null>(null);
  const symbol = useMarket((state) => state.symbol);
  const market = getMarket(symbol);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let drawnVersion = -1;
    let needsDraw = true;
    let frame = 0;

    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const ratio = Math.min(devicePixelRatio, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      needsDraw = true;
    });
    observer.observe(canvas);

    const onMove = (event: PointerEvent) => {
      hoverX.current = event.offsetX;
      needsDraw = true;
    };
    const onLeave = () => {
      hoverX.current = null;
      needsDraw = true;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    function draw() {
      const { points } = getSeries();
      context!.clearRect(0, 0, width, height);
      if (points.length < 2 || !width) return;

      const plotWidth = width - AXIS_WIDTH;
      const prices = points.map((point) => point.price);
      let low = Math.min(...prices);
      let high = Math.max(...prices);
      if (low === high) {
        low -= 1;
        high += 1;
      }
      const startTime = points[0].time;
      const timeSpan = points[points.length - 1].time - startTime || 1;
      const toX = (time: number) => ((time - startTime) / timeSpan) * plotWidth;
      const toY = (price: number) =>
        PADDING_Y + (1 - (price - low) / (high - low)) * (height - PADDING_Y * 2);

      context!.font = "11px Menlo, Consolas, monospace";
      context!.textBaseline = "middle";

      for (let step = 0; step <= 4; step += 1) {
        const price = low + ((high - low) * step) / 4;
        const y = toY(price);
        context!.strokeStyle = COLORS.grid;
        context!.beginPath();
        context!.moveTo(0, y);
        context!.lineTo(plotWidth, y);
        context!.stroke();
        context!.fillStyle = COLORS.label;
        context!.fillText(formatNumber(price, market.priceDecimals), plotWidth + 8, y);
      }

      context!.beginPath();
      points.forEach((point, index) => {
        const x = toX(point.time);
        const y = toY(point.price);
        if (index === 0) context!.moveTo(x, y);
        else context!.lineTo(x, y);
      });
      context!.strokeStyle = COLORS.line;
      context!.lineWidth = 1.4;
      context!.stroke();
      context!.lineWidth = 1;

      context!.lineTo(plotWidth, height);
      context!.lineTo(0, height);
      context!.closePath();
      const gradient = context!.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, COLORS.fillTop);
      gradient.addColorStop(1, COLORS.fillBottom);
      context!.fillStyle = gradient;
      context!.fill();

      const last = points[points.length - 1];
      const lastY = toY(last.price);
      context!.setLineDash([3, 3]);
      context!.strokeStyle = COLORS.last;
      context!.beginPath();
      context!.moveTo(0, lastY);
      context!.lineTo(plotWidth, lastY);
      context!.stroke();
      context!.setLineDash([]);
      context!.fillStyle = COLORS.last;
      context!.fillRect(plotWidth, lastY - 9, AXIS_WIDTH, 18);
      context!.fillStyle = "#0B0709";
      context!.fillText(formatNumber(last.price, market.priceDecimals), plotWidth + 8, lastY);

      const mouseX = hoverX.current;
      if (mouseX !== null && mouseX <= plotWidth) {
        const time = startTime + (mouseX / plotWidth) * timeSpan;
        const nearest = points.reduce((best, point) =>
          Math.abs(point.time - time) < Math.abs(best.time - time) ? point : best,
        );
        const x = toX(nearest.time);
        const y = toY(nearest.price);
        context!.strokeStyle = COLORS.label;
        context!.beginPath();
        context!.moveTo(x, 0);
        context!.lineTo(x, height);
        context!.stroke();
        context!.fillStyle = COLORS.line;
        context!.beginPath();
        context!.arc(x, y, 3, 0, Math.PI * 2);
        context!.fill();
        const label = `${formatNumber(nearest.price, market.priceDecimals)}  ${formatTime(nearest.time)}`;
        const labelWidth = context!.measureText(label).width + 14;
        const labelX = Math.min(x + 8, plotWidth - labelWidth);
        context!.fillStyle = "#16100F";
        context!.fillRect(labelX, 6, labelWidth, 20);
        context!.fillStyle = COLORS.line;
        context!.fillText(label, labelX + 7, 16);
      }
    }

    // Draw only when new data or the mouse changed something.
    function loop() {
      const { version, points } = getSeries();
      if (version !== drawnVersion || needsDraw) {
        drawnVersion = version;
        needsDraw = false;
        draw();
        setHasData(points.length >= 2);
      }
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [market.priceDecimals]);

  return (
    <section className="panel chart" aria-label={`${market.base} price chart`}>
      <header className="panel__head">
        <h2>{market.base}/USDT</h2>
        <span>Last 5 minutes</span>
      </header>
      <div className="chart__plot">
        <canvas ref={canvasRef} role="img" aria-label={`Live ${market.name} price line`} />
        {!hasData && <p className="chart__empty">Loading price history</p>}
      </div>
    </section>
  );
}
