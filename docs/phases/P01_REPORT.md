# P01 report — 2026-10-07 UTC live session

Gate: REST_VERIFIED_WS_BLOCKED

Research: first-party OpenAPI + docs (Jupiter prediction beta, OpenAI Decisions, TypeSafe quickstart, Fastino llms.txt) + prior evidence log; unknowns enumerated (WS subscribe, payout rounding, retention).

Plan: atomic edits listed in research/fixtures/jupiter.*.json,src/discovery.mjs; acceptance npm test + discover + fixture SHA.

Execute: OpenAPI 3.0.0 85 paths SHA 1d19a16b, 7 read-only /play GETs, roundsInSchema true. config/current/timeline?asset=BTC/single-round/timestamp-price LIVE_PROBED with fixtures. WS OPEN ok 0 frames, subscribe UNKNOWN. Touched: research/fixtures/jupiter.*.json,src/discovery.mjs.

Audit: no wallet/signing, allowlist enforced, venue outcome authoritative, backfill isolated, PnL NULL, no secrets logged.

Verify: npm test 40/40 exit 0; discover roundsInSchema true; doctor exit 0; demo fixture-only; replay pass (0 live). No model calls.

Repair: 2 failures fixed (legacy venue-null fallback, live+bettable combine) with regression tests; max 3 attempts respected.

Unknowns/next: see ops/BLOCKERS.md (WS subscribe, payout math, auth smoke).
