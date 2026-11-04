# Spread

A read-only live market terminal: a real-time order book, trades feed and price
chart running on a public WebSocket feed. No orders are placed and no account is
needed.

Built with Next.js, React and TypeScript. The chart is hand-drawn on canvas with
no chart library.

## Features

- Live order book with depth bars and change flashes
- Live trades feed and a 5 minute price chart with a crosshair
- Six markets, with search on `Cmd+K` and `↑` `↓` to switch
- Live, waiting and reconnecting states, with automatic recovery
- A performance panel measuring messages, commits, commit time and frame rate
- A labelled load test and a batching switch, so the behaviour can be checked live

## How it works

```text
WebSocket feed -> adapter -> buffer -> one commit per frame -> React panels
                                   \-> price series -> canvas chart
```

1. **Adapter** (`src/lib/feeds/`): `binance.ts` implements the `MarketFeed`
   interface. The rest of the app only knows that interface, so another market
   can be added by writing one adapter.
2. **Store** (`src/lib/store.ts`): messages go into a buffer instead of straight
   into React. Once per animation frame, the buffer is committed in one update.
3. **Panels** (`src/components/`): each panel subscribes to only the slice it
   needs, and order book rows are memoised, so a trade doesn't re-render the book.
4. **Chart**: reads the price series on its own animation frame, outside React.

## Performance

Measured on the production build in a desktop browser on a MacBook Air, at
1440x900. The load test adds 500 simulated book updates a second, on top of the
real feed.

| Test | Messages/s | UI commits/s | Frame rate |
| --- | --- | --- | --- |
| Before the fix, batching on | 405 | 42 | 46 fps |
| Before the fix, batching off | 81 | 81 | 7 fps |
| After the fix, batching on | 526 | 53 | 60 fps |
| After the fix, batching off | 541 | 541 | 60 fps |

## Hardest decision

I assumed React was the bottleneck, so I built batching first. Measuring showed
something else: commit time stayed under 4 ms, yet the frame rate fell to 7 fps.
The cost was in the browser's animation work, with a CSS transition on every depth
bar and row flashes stacking on busy rows.

Removing the transition and limiting each row to four flashes a second took the
frame rate to 60 fps with batching on or off. Batching still removes about 90% of
commits, which leaves more time for the browser, but it wasn't the main fix.

## What I'd improve next

- Add a prediction market adapter. Polymarket and Kalshi weren't reachable from my
  network in India, so the data layer is ready for one but doesn't have one yet.
- Merge the incremental depth stream so the book can show more than 20 levels.
- Run the same load test on a low-end phone, where the limits will be much tighter.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Keyboard: `Cmd+K` search, `↑` `↓` markets, `B` batching, `L` load test.
