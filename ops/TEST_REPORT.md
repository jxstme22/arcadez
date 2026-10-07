# Offline test report — live overnight session, 2026-10-07

**Date (UTC):** 2026-10-07 ~04:09. **Host:** darwin, Node v22.18.0, npm 11.17.0. **Repo:** no git (not a git repository), so no commit hash; changes are working-tree only under `/Users/welly/arcadez`.

**Commands (actual stdout/exit):**
- `npm test` → **40 passed, 0 failed** (25 core + 6 live-wire + 5 adapters + 4 patterns). Exit 0. Node SQLite ExperimentalWarning only.
- `node src/cli.mjs doctor` → exit 0, mode READ_ONLY_PAPER, roundsUrl verified timeline, WS url verified, notes include PnL-disabled + schema-must-be-discovered.
- `node src/cli.mjs demo 5` → exit 0, synthetic `var/demo-fixture` 10 rounds (5 requested, demo loop uses count), labeled `SYNTHETIC DEMO ONLY`.
- `node src/cli.mjs report` (live `./var`) → exit 0, 0 rounds/0 ticks/0 snapshots/0 poolObs (live DB only holds evidence + clock; no paper rounds yet). `profitStatus NOT_CALCULATED_UNTIL_VERIFIED_PRELOCK_PAYOUT`.
- `node src/cli.mjs replay` → exit 0, `{replayedLiveSnapshots:0, skippedFixtureSnapshots:0, pass:true}` (no live snapshots yet, not a live verification).
- `node src/cli.mjs discover` → exit 0, `openApiVersion 3.0.0`, 7 read-only `/play` GET paths, `roundsInSchema true`, saved to SQLite + `research/fixtures`.

**Scope covered:** Jupiter allowlist rejects writes/foreign hosts; exact provider POST routes + X-API-Key vs Bearer; micro-price parsing without float; venue round decode incl. real PlayRound (settled UP/DOWN, live pending, future null-status pending, SOL rejected, outcome-mismatch fails closed, VOID authoritative); `extractRounds` for `{data}`, `{live,bettable}`, single object; causality (future-received tick excluded, historical backfill never live, stale fails closed); thresholds fixed .57/.43; per-round uniqueness; NULL PnL after settle; next-round-only selection; SKIP_NO_LIVE_DATA spends zero tokens; deadline LATE/MISSED_LOCK → SKIP; OpenAPI GET-only filter; e2e fanout 3 arms + settle + stats; snapshot replay parity + fixture isolation; harvest args bounded; out-of-order poll preserves settlement; mock OpenAPI persistence; budget caps per-arm/session; 401/429→ERROR never trade; malformed prob →ERROR; pattern regimes 24 frozen + seeded scenarios + embargo neighbors; pool observation stored with NULL PnL; venue lock = start-max(buffer,5000+1000).

**Not covered / not claimed:** authenticated provider calls (0 made), live WS frame decode (0 frames observed), 100-round prospective capture, 24h replay, calibrated Brier on live data, any profitability. Demo wins are `FIXTURE_ONLY`, excluded from real scores.

**Negative tests run before positive:** missing key, 429, stale feed, broken WS (0-frame timeout), late inference, duplicate rounds, adversarial timestamps, future source time, out-of-order REST, conflicting winner, unbounded harvest args — all fail closed to SKIP/ERROR/BLOCKED.

## P10→P12 session (2026-10-07 ~11:35 UTC): 47 passed, 0 failed
Added tests/ws-payout.test.mjs (6: fixture decode, BTC-only tick, control/malformed, gross/net math, empty-pool null) and tests/bench.test.mjs (20-round mock: identical snapshot_sha, deadline, settlement, CSV). One repair (empty-pool payout → null). Live: scripts/verify-ws.mjs 10.3-min pass (exit 0, verification.json); scripts/paper-smoke-live.mjs without flag exits BLOCKED with 0 calls (verified). No provider calls, no fake rounds.

## Master continuation (2026-10-07 ~12:30 UTC): 61 passed, 0 failed
+7 providers (normalize contract: VALID/LATE/TIMEOUT/RATE_LIMITED/AUTH_ERROR/MALFORMED/UNAVAILABLE, inversion guard, per-code mapping) +6 history (determinism, priceAt snap, chrono order, TRAIN-only thresholds, Wilson) +1 packet (shadow-only). Two repairs: historical_prices promoted to Store migration (was harvest-lazy); empty-pool payout already fixed prior session. Live: smoke gate re-verified BLOCKED/0 calls; dashboard /api/research + POST-405 verified on :8899. 0 provider calls, 0 live rounds.

## User-approved live session (2026-10-07 ~15:30 UTC): suite 76/76; P11B/P11C live paths clean
66 inference calls (3 + 63), 0 parse failures, 0 late, 0 errors. Audit queries: 0 multi-hash rounds, 0 pre-snapshot sends. Foundry tests: ledger/sessions/gaps, redacting trades decoder + allowlist, tape gaps NULL + order-independent replay, rich-feature causality/determinism/sequences.

## Main session (2026-10-07 ~16:00 UTC): 78/78 (GLiDE inversion-proof + freeze-integrity)
M01 live-formula check (|2n-1| on P11 raw), M02 hash recheck 9/9+prompt, M03 gate re-verified BLOCKED/0 calls, audit harness validated (PASS on P11, NO_BENCHMARK on empty), session-A harvest verified non-empty across 6 tables.

## P12 launch session: 79/79; P12 evidence verified by query (single-hash, deadline, settlement order); budget guard reproduced OK in isolation; anomaly documented.

## Session B max-harvest (2026-10-07 ~14:00 UTC): 90/90 at time of writing (later 99/99 as Session A added suites; 0 failed throughout)
+6 `tests/history-rich.test.mjs` (venue UP/DOWN-only labels with VOID excluded; 13 snapshots invariant under future-price poisoning; exact-cutoff inclusion/exclusion; no-interpolation context path; past-only + deterministic longer context; version pin). One repair during development: `longerContext` open-boundary fallback (`at(openSec)`) leaked future prices — replaced with backward scan `lastAtOrBefore(ts<=openSec-1)`; poisoning test caught it. Session-A suites (features/ledger/pllearn/trades) also green in the same run. 0 provider calls, 0 live rounds from Session B.
