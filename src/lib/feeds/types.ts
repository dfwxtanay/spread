// The contract every data source implements. The store and UI only know this
// interface, so adding a prediction market means writing one new adapter.

export type Level = { price: number; size: number };

export type Book = { bids: Level[]; asks: Level[] };

export type Trade = {
  id: number;
  price: number;
  size: number;
  time: number;
  side: "buy" | "sell";
};

export type Ticker = { price: number; open: number };

export type PricePoint = { time: number; price: number };

export type FeedStatus =
  | { state: "connecting"; attempt: number }
  | { state: "live"; host: string }
  | { state: "stale"; silentMs: number }
  | { state: "reconnecting"; attempt: number; retryInMs: number };

export type FeedHandlers = {
  onBook: (symbol: string, book: Book) => void;
  onTrade: (symbol: string, trade: Trade) => void;
  onTicker: (symbol: string, ticker: Ticker) => void;
  onStatus: (status: FeedStatus) => void;
};

export interface MarketFeed {
  readonly name: string;
  connect(symbol: string, handlers: FeedHandlers): void;
  setMarket(symbol: string): void;
  disconnect(): void;
  /** Force-closes the socket so the recovery path can be demonstrated. */
  dropConnection(): void;
  history(symbol: string, signal: AbortSignal): Promise<PricePoint[]>;
}
