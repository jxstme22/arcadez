# Operations and incident runbook

## Supported commands

`npm test` offline regression; `npm run demo` isolated synthetic fixture; `npm run doctor` key presence + read-only configuration; `npm run discover` GET OpenAPI audit; `npm run start:paper` combines dashboard and runner; `npm run paper` prospective prediction, **fail-closed** until exact GET round path exists; `npm run dashboard` loopback UI; `npm run report` JSON metrics. `npm run capture -- 30` bounded raw read-only Jupiter collection without keys or inference. `npm run harvest -- --from ISO --to ISO --step 60 --limit 240` bounded slow historical-second lookup with `HISTORICAL_BACKFILL` provenance, separate table. Requires Node >=22.13 and public internet for discovery/live.

## Safe morning sequence

1. Confirm `ops/MORNING_REPORT.md` from coding agent exists and has real tests/checks, or regard agent run unfinished.
2. Copy `.env.example` to `.env`, paste three model API keys locally. Never paste into chat or terminal history. Set provider hard billing caps.
3. Run `npm test`, `npm run doctor`, `npm run discover`; verify `roundsInSchema=true` and at least one valid price WS fixture. If blocked, agent must solve actual protocol discovery; do not fabricate.
4. `npm run paper` in terminal one; inspect `SKIP_NO_LIVE_DATA` / `ERROR` until known good. No trades can be sent by the code.
5. `npm run dashboard` in terminal two; inspect http://127.0.0.1:8789. `npm run report` exports current JSON summary.
6. Keep device awake for continuous collection, e.g. macOS `caffeinate -i npm run paper` with a terminal session; closing terminal or sleeping the host stops recording.

## Incident handling

- OpenAPI unavailable / changed: pause paper; save status and new spec SHA; inspect GET path; update normalization fixture and tests; resume only with new version.
- WebSocket close: exponential backoff, gap logged; never forward fill price indefinitely; skip until fresh ticks.
- Source timestamp > receive +200ms or older than configured age: reject and note clock sync investigation; don't disable causality gate.
- API key 401/403: disable only that arm; user checks key and product eligibility. API 422: preserve scrubbed error category and fix request against authoritative schema; avoid retry loop.
- API 429/529 or timeout: log, skip that round, retain other arms; bounded retry only when still before deadline and explicitly researched.
- Venue not settling / VOID: leave pending or VOID; don't infer from Jupiter timestamp-price endpoint alone.
- Pool info missing: mark paper PnL unknown; do not substitute fixed 1.9x.
- Disk full, DB corruption: stop model calls, preserve raw, backup read-only, report and repair offline; no silent loss.

## Integrity review

Every morning export counts, no-data skips, missing key arms, response latency, settled labels, zero real writes, absence of private keys; only claim "paper results" for actual live recorded venue data. Demo is permanently excluded. Verify core tests after any protocol edit and recompute hashes of fixtures.
