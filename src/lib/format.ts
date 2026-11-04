const formatters = new Map<number, Intl.NumberFormat>();

// Creating an Intl formatter is slow, so reuse one per decimal count.
export function formatNumber(value: number, decimals: number) {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

export function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatTime(time: number) {
  return new Date(time).toLocaleTimeString("en-GB", { hour12: false });
}
