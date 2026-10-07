# Database design — RAW / NORMALIZED / DERIVED / RESEARCH (2026-10-07)

SQLite (`var/*.sqlite`, WAL). All tables `CREATE TABLE IF NOT EXISTS` (additive migrations).

## RAW (immutable observations, never updated)

- `raw_events(source,kind,source_ms,received_ms,sha,payload)` — every inbound message incl. WS frames, round responses, rejected ticks, minute bars.
- `raw_btc_ticks(...)` — per-tick ledger: session, raw JSON, price/source/receive/ingest ts, gap_before, duplicate flag, valid + reason, collector/schema versions, provenance.
- `stream_sessions` / `stream_gaps` / `ws_health` — connection ledger, source-time jumps, periodic health.
- `trade_minute_bars` — per-minute per-asset UP/DOWN counts + stake sums (PII-redacted at ingest; no round linkage by design).

## NORMALIZED (typed, deduped, still observation-faithful)

- `ticks` — accepted fresh WS ticks (subset of raw_btc_ticks).
- `rounds` — latest live venue view per id (upsert preserves settled results).
- `round_state_observations(round_id,observed_ms,...)` — every poll's venue status/outcome/pools (pool evolution ≈1s cadence).
- `pool_observations` — pool snapshots per round observation.
- `historical_rounds` (`VENUE_RECORDED` only) + `historical_prices` (`HISTORICAL_BACKFILL`) — isolated in `var/history`; live tables hold 0 rows there.

## DERIVED (computed, reproducible from RAW)

- `snapshots` — frozen T-10s live inputs (`LIVE_RECEIVED_JUPITER_ONLY`); multi-horizon via `snapshotsForRound` (research, not persisted).
- Canonical tape (`buildTape`) and rich features (`featuresRich`) are computed, not stored — replay-safe by construction.
- `historical_candles` — NOT harvested (endpoint params unknown after 3 bounded probes).

## RESEARCH (decisions + evaluation)

- `decisions` / `paper` (PnL NULL until payout verified) / `evidence` (schema audits, clock, WS state).
- `dataset_versions` — reserved for H17 freezes (no freeze executed; <1000 rounds).

Indexes: `raw_events(received_ms)`, `ticks(received_ms)`, `raw_btc_ticks(source_ts_ms)`.
