# P02 report — 2026-10-07 UTC live session

Gate: COLLECTOR_REPLAY_VERIFIED_OFFLINE

Research: first-party OpenAPI + docs (Jupiter prediction beta, OpenAI Decisions, TypeSafe quickstart, Fastino llms.txt) + prior evidence log; unknowns enumerated (WS subscribe, payout rounding, retention).

Plan: atomic edits listed in src/collector.mjs,src/store.mjs; acceptance npm test + discover + fixture SHA.

Execute: Fixed timeline 400 (query required). Collector polls current+timeline, clock drift, pool_observations, raw preserved. Replay pass (0 live snapshots). Touched: src/collector.mjs,src/store.mjs.

Audit: no wallet/signing, allowlist enforced, venue outcome authoritative, backfill isolated, PnL NULL, no secrets logged.

Verify: npm test 40/40 exit 0; discover roundsInSchema true; doctor exit 0; demo fixture-only; replay pass (0 live). No model calls.

Repair: 2 failures fixed (legacy venue-null fallback, live+bettable combine) with regression tests; max 3 attempts respected.

Unknowns/next: see ops/BLOCKERS.md (WS subscribe, payout math, auth smoke).
