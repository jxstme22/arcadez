# P07 report — 2026-10-07 UTC live session

Gate: HISTORICAL_DATASET_RESEARCH_READY_PARTIAL

Research: first-party OpenAPI + docs (Jupiter prediction beta, OpenAI Decisions, TypeSafe quickstart, Fastino llms.txt) + prior evidence log; unknowns enumerated (WS subscribe, payout rounding, retention).

Plan: atomic edits listed in src/harvest.mjs,research/fixtures/jupiter.price.timestamp.20261007.json; acceptance npm test + discover + fixture SHA.

Execute: Timestamp price verified, harvest bounded isolated HISTORICAL_BACKFILL, single-round spot check. No bulk run. Touched: src/harvest.mjs,research/fixtures/jupiter.price.timestamp.20261007.json.

Audit: no wallet/signing, allowlist enforced, venue outcome authoritative, backfill isolated, PnL NULL, no secrets logged.

Verify: npm test 40/40 exit 0; discover roundsInSchema true; doctor exit 0; demo fixture-only; replay pass (0 live). No model calls.

Repair: 2 failures fixed (legacy venue-null fallback, live+bettable combine) with regression tests; max 3 attempts respected.

Unknowns/next: see ops/BLOCKERS.md (WS subscribe, payout math, auth smoke).
