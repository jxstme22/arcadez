# Clean-room architecture & interface contracts

## Runtime

Node >=22.13, dependency-free native ESM, built-in SQLite (experimental in Node 22; prefer Node 24 LTS); no runtime bundler. This favors immediate offline execution without npm registry access. Strict TypeScript migration with schema-generated types may be undertaken after remote payloads are observed; don't invent third-party type packages.

Components: `src/config.mjs` env parser and guards; `http.mjs` exact host+verb allowlists; `discovery.mjs` read-only OpenAPI; `collector.mjs` GET round polling, WS, raw frames, bounded reconnection; `market.mjs` conservative typed normalization & time-derived features; `store.mjs` SQLite immutable observations, round states, predictions and paper ledger; `models.mjs` independent OpenAI/Jev/GLiDE APIs; `paper.mjs` single-shot prospective gate; `dashboard.mjs` local read-only browser; `cli.mjs` operator commands.

### State boundaries

1. External Jupiter origin: untrusted JSON. Preserve raw; validate then normalize. Use UTC epoch and monotonic ordering. No default tick symbol, no guessed price if missing.
2. Snapshots are frozen at one `as_of_received_ms`; deterministic derived features; all inputs have receipt timestamp ≤ `as_of` and source event time ≤ `as_of`.
3. Three adapters get identical semantic JSON from one snapshot; their wire envelopes differ, but no added market facts.
4. One virtual action per `(target_round_id, provider_arm)`; late and missing model results record SKIP. No cross-arm fallback.
5. Only official venue round values close outcomes; a timestamp price lookup is **not** alone a venue settlement label.
6. Independent research backfill is stored with distinct `HISTORICAL_BACKFILL` provenance and never enters `featuresAsOf`.
7. The local dashboard serves only derived statistics from SQLite on `127.0.0.1`; no writes, external analytics or model keys in browser.

### Target discipline

If current time is T-10s before **next** round start A, predict `sign(B-A)` for B=A+60s. The previous round's close might equal next A once boundary occurs, but **A cannot be used before A**. Data must be strictly pre-lock as seen by the running process. Predicting `sign(last_price - last_round_open)` would be the wrong task.

### Failure classes

`BLOCKED_UNVERIFIED_ROUNDS_ROUTE`, `ROUNDS_UNRECOGNIZED_SCHEMA`, `WS_CONNECT_ERR`, `SKIP_NO_LIVE_DATA`, `DISABLED_MISSING_KEY`, `DISABLED_BUDGET`, `ERROR`, `MISSED_LOCK`, `LATE`, `OK`. Warn, log and continue collecting when possible; never transform an error to a trade.

### Extension points

- Price/candle typed decoder after live fixtures.
- Schema-version registry and source change detection.
- Signed payout math only after evidence.
- Reliable shutdown, SQLite checkpointing, on-disk retention policy.
- Evaluator for paired Brier/logloss reliability intervals and block bootstrap.
- Pattern Lab as **separate experimental arm**, not contaminating frozen V0 baseline.
