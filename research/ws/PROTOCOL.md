# Jupiter crypto price WS protocol — 2026-10-07

## Sources

- DOCUMENTED: `wss://prediction-market-price-service.fly.dev/ws/crypto` path matches prior repo config; REST `GET /price/crypto/{symbol}?timestamp={sec}` verified live.
- OBSERVED (production bundle `vendor-tanstack-runtime-BGcYqU3f.js`, fetched 2026-10-07 from `https://jup.ag`):
  - `BASE_WS_URL = wss://prediction-market-price-service.fly.dev/ws`, `CRYPTO_WS = ${BASE}/crypto`
  - `subscribeCrypto = symbols => send({type:'subscribe', symbols})`
  - `unsubscribeAllCrypto = send({type:'unsubscribe_all'})`
  - Frame reducer: control frames `{type: snapshot|subscribed|unsubscribed|unsubscribed_all|error}`; price frames `{symbol, value, timestamp}`; keep last 120 per symbol; drop older timestamp; replace on equal timestamp.
  - Stale policy: reconnect if no message for 30s; poll every 10s when online.
- OBSERVED (live probe 2026-10-07 ~11:19 UTC):
  - OPEN ~3s, send `{"type":"subscribe","symbols":["btcusdt"]}`
  - Frame 1 `{"type":"snapshot","symbol":"btcusdt","data":[{symbol,timestamp(ms),value}×~120]}` (~8.7KB)
  - Frame 2 `{"type":"subscribed","symbols":["btcusdt"]}`
  - Frames 3+ `{"symbol":"btcusdt","timestamp":1791346752000,"value":84065.87}` ~1/sec
  - Fixture: `research/ws/fixtures/snapshot-subscribed-ticks-20261007.json`
- INFERRED: timestamp is Unix ms (matches REST `timestamp === sec*1e3` check; values ~1.79e12). Symbol lowercase `btcusdt`. Snapshot covers ~120 most recent seconds; live ticks continue at ~1Hz.
- UNKNOWN: heartbeat/ping-pong (none observed; stale detected by 30s silence), auth (none; `upstream_connect_failed` error path exists but not seen), rate limits on subscribe, candle params, `spcxusd` symbol cadence, server-side snapshot cadence.

## Wire contract (implemented)

- Subscribe: `{"type":"subscribe","symbols":["btcusdt"]}` — BTC only in this repo.
- Price tick: `{symbol:'btcusdt', value:number(1000..1e6), timestamp:ms}` → normalized with `sourceMs=timestamp`, `receivedMs=Date.now()`, `provenance LIVE_RECEIVED_WS`. Rejected if `sourceMs > receivedMs+200` or `receivedMs-sourceMs > 10000`, or symbol ≠ btcusdt.
- Snapshot: `{type:'snapshot', symbol:'btcusdt', data:[tick×N]}` → each entry decoded independently; malformed entries stored separately with reason.
- Control: `subscribed` (ack), `unsubscribed`, `unsubscribed_all`, `error` (logged, triggers reconnect on `upstream_connect_failed`).
- Lifecycle: DISCONNECTED → CONNECTING → CONNECTED_UNSUBSCRIBED → SUBSCRIBING → LIVE ⇄ STALE → RECONNECTING → FAILED. Exposed via `getWsState()` + `npm run doctor` + SQLite `ws_health` + dashboard.

## Payout mechanics (frontend-observed, arcade bundle)

- Source: `assets/arcade-c0dHAUTl.js` (fetched 2026-10-07): `gn({upPool,downPool})` gross multiplier = `total/winnerPool`; `1.0` if total zero; `null` if winning side empty. `vn(round,position)` net payout = `stake × gross × 0.99` (9900/1e4, matches `feeBps 100`).
- Display rounds to 2 decimals + `x`, else `—`. One-sided pool → `Only the Down/Up pool had bets` + VOID settlement path.
- UNVERIFIED: on-chain `feeAmount` field (≈0.02–0.2% of total in sampled settled rounds, not 1%) — semantics unknown. `remainingPayout` dust (0–2 micro). Rounding (float `.toNumber()` vs integer floor) unconfirmed. Paper PnL stays NULL until claim-level proof.
