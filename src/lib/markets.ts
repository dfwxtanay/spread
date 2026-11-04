export type Market = {
  symbol: string;
  base: string;
  name: string;
  priceDecimals: number;
  sizeDecimals: number;
};

export const MARKETS: Market[] = [
  { symbol: "BTCUSDT", base: "BTC", name: "Bitcoin", priceDecimals: 2, sizeDecimals: 4 },
  { symbol: "ETHUSDT", base: "ETH", name: "Ethereum", priceDecimals: 2, sizeDecimals: 3 },
  { symbol: "SOLUSDT", base: "SOL", name: "Solana", priceDecimals: 2, sizeDecimals: 2 },
  { symbol: "BNBUSDT", base: "BNB", name: "BNB", priceDecimals: 2, sizeDecimals: 3 },
  { symbol: "XRPUSDT", base: "XRP", name: "XRP", priceDecimals: 4, sizeDecimals: 1 },
  { symbol: "DOGEUSDT", base: "DOGE", name: "Dogecoin", priceDecimals: 5, sizeDecimals: 0 },
];

export const DEFAULT_SYMBOL = MARKETS[0].symbol;

export function getMarket(symbol: string): Market {
  return MARKETS.find((market) => market.symbol === symbol) ?? MARKETS[0];
}
