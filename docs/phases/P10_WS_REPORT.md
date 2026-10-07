# P10 WS report — 2026-10-07 (live session)

Gate: **P10_WS=PASS** (protocol verified + 10-min live verification).

## Research

- Production bundle `https://jup.ag/assets/vendor-tanstack-runtime-BGcYqU3f.js` (3.6MB, fetched 2026-10-07): `BASE_WS_URL=wss://prediction-market-price-service.fly.dev/ws`, `CRYPTO_WS=${BASE}/crypto`, `subscribeCrypto(symbols)=>send({type:'subscribe',symbols})`, `unsubscribeAllCrypto()=>send({type:'unsubscribe_all'})`. Reducer keeps last 120/symbol, drops older timestamps, replaces on equal. Stale after 30s silence. Raw saved under `research/ws/raw/`.
- Live probe: OPEN ~3s, subscribe `{"type":"subscribe","symbols":["btcusdt"]}` → `snapshot` (~120 ticks) + `subscribed` ack + `~1Hz` ticks `{symbol,timestamp(ms),value}`. Fixture `research/ws/fixtures/snapshot-subscribed-ticks-20261007.json`. Protocol doc `research/ws/PROTOCOL.md`.

## Execute

- New `src/ws.mjs`: lifecycle DISCONNECTED→CONNECTING→CONNECTED_UNSUBSCRIBED→SUBSCRIBING→LIVE⇄STALE→RECONNECTING→FAILED; snapshot+tick decode; BTC-only (`btcusdt`); source/receive timestamps; 10s open timeout; 30s stale watchdog; resubscribe on reconnect; capped backoff; raw + rejected frames retained separately; duplicates deduped by sourceMs; gaps tracked. Wired into `src/collector.mjs` (`getWsState/getWsMetrics`, `getTicks()` reads `store.recentTicks()`), `src/cli.mjs doctor` (subscribe shape + ws/payout status), dashboard health cards.
- Tests `tests/ws-payout.test.mjs`: fixture decode, SOL rejection, future-timestamp rejection, control/malformed handling.

## Verify

- `scripts/verify-ws.mjs` 10.3 min live run 04:22–04:33 UTC → `research/ws/verification.json`: **frames 981, validTicks 589, duplicates 400, malformed 346, gaps 0, maxGap 0, reconnects 1 (forced, recovered), iar p50 951ms / p90 1664ms / p99 2689ms, SOL-only frames 0, final state LIVE → pass:true, exit 0**.
- Notes: 346 malformed = snapshot-backfill ticks older than the strict 10s live gate, rejected by design (safe direction; `featuresAsOf` would also refuse them without a fresh last tick). 400 duplicates = snapshot overlap across reconnect, deduped by sourceMs. No causality violations (all accepted ticks satisfy `sourceMs<=receivedMs+200`, `receivedMs-sourceMs<=10s`, `receive<=as_of`).
- `npm test` 47/47 green (46 before bench + 1 bench).

## Repair

- One failure: empty-pool paper payout returned stake×0.99 instead of null → fixed to null unless gross reason OK, regression test added. No WS repairs needed (first-attempt pass).

## Freeze

- WS=VERIFIED. Remaining: payout on-chain fee (see P10_PAYOUT_REPORT), provider smoke (see P11).
