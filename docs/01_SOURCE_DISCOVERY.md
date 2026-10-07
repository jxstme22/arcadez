# Read-only Jupiter and model source discovery

## Evidence tiers

- `OFFICIAL_PUBLIC_DOC`: publicly published authoritative docs with accessed date, path, link.
- `FRONTEND_OBSERVED`: hard-coded route observed in Jupiter first-party production bundle; supported by saved snippet/hash, not officially maintained developer endpoint.
- `OPENAPI_OBSERVED`: downloaded valid server schema with retrieval UTC, SHA and exact GET method.
- `LIVE_PROBED`: bounded GET/WS response captured with raw JSON/headers and receive timestamps.
- `UNKNOWN`: never guess a body field, WS subscribe message, rate-limit, historical retention or payout property.

## Known facts and unsettled contracts

Earlier separate research saw `https://prediction-market-api.jup.ag/api/v1/play/*`, `https://prediction-market-api.jup.ag/openapi.json`, `wss://prediction-market-price-service.fly.dev/ws/crypto`, `/ws/play/trades`, and `https://prediction-market-price-service.fly.dev/price/crypto/btcusdt?timestamp=...`. These are **pre-existing research clues, not independently live-verified in this new repo**. The mainstream `https://developers.jup.ag/docs/prediction` API is a distinct venue/product family; do not substitute its event/order endpoints for Arcade rounds.

The source host's full OpenAPI spec was inaccessible from the packaging environment. Therefore the starter's rounds URL is a **candidate**, not verified. `npm run discover` saves the entire obtained schema, extract of GET `/play` paths, and a `roundsInSchema` boolean. `npm run paper` refuses if the candidate isn't an exact GET path in that schema. Price WS currently parses only explicit timestamped BTC quote frames; if the wire uses another structure the collector saves raw frames and takes zero bets until an agent creates an observed fixture and adds a tested adapter.

## Agent research jobs

1. Check public Jupiter docs/llms index and source comments for product separation. Capture doc URL/date and precise claims.
2. Read `/openapi.json` with GET only; retain full bytes SHA and inspect servers, path/schema, required query params, per-endpoint auth, possible statuses. **Enumerate all `/play` GET paths; DO NOT probe non-GET endpoints.**
3. Choose existing upcoming-round list/info GET endpoint. Save 10 raw real responses with source headers / receive timestamps. Confirm asset, stable `roundId`, next start, duration, lock deadline field if any, open/close and status across a full cycle.
4. Connect price WS; capture 300 raw frames into *fixture evidence*, recording connect/open/ping/close. Derive supported symbol, message nesting, source timestamp, heartbeat and subscription payload by observing first-party behavior; do not fabricate a subscription.
5. Cross-check 60-second round settlement direction from raw venue open/close as exact micro-unit strings, and confirm VOID/refund conditions with venue data.
6. Probe `/price/crypto/btcusdt/candles` and bounded price-by-second GET only after reading route behavior; determine retention floor, interval alignment, pagination, fees, legal restrictions, and rate limits.
7. Establish pool/payout payload, snapshot receive time, last tradable cutoff, and when displayed odds lock; if absent, keep `paper.pnl_usdc=NULL`.
8. Record all failures (401,403,404,422,429,5xx), server version, endpoint contract changes, and recovery action. Respect all provider limits.

## Evidence exit gate

- GET `/play` round endpoint method/path found in captured schema.
- A valid next-round object with confirmed BTC, unique round ID, future open UTC, exact 60s duration, and documented/observed label logic.
- Price WS yields fresh timestamped BTC data, receipt time present, no future tick, replay fixture proves parse consistency.
- Zero non-GET Jupiter endpoints called; no key or wallet used.

If any fail: phase `BLOCKED_SCHEMA` / `BLOCKED_PRICE_WS`; preserve raw evidence, continue offline work only. Do not edit safeguards merely to force paper mode. Output `ops/API_AUDIT.md` with SHA/source/time, and a fixture per source.
