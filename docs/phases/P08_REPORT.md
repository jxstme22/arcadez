# P08 report — 2026-10-07 UTC live session

Gate: PATTERN_RESEARCH_READY_SKELETON

Research: first-party OpenAPI + docs (Jupiter prediction beta, OpenAI Decisions, TypeSafe quickstart, Fastino llms.txt) + prior evidence log; unknowns enumerated (WS subscribe, payout rounding, retention).

Plan: atomic edits listed in src/patterns.mjs,tests/patterns.test.mjs; acceptance npm test + discover + fixture SHA.

Execute: 24 frozen regimes pattern-lab-v1-20261007, classify deterministic, seeded 100-path UNCALIBRATED, embargo neighbors. No edge. Touched: src/patterns.mjs,tests/patterns.test.mjs.

Audit: no wallet/signing, allowlist enforced, venue outcome authoritative, backfill isolated, PnL NULL, no secrets logged.

Verify: npm test 40/40 exit 0; discover roundsInSchema true; doctor exit 0; demo fixture-only; replay pass (0 live). No model calls.

Repair: 2 failures fixed (legacy venue-null fallback, live+bettable combine) with regression tests; max 3 attempts respected.

Unknowns/next: see ops/BLOCKERS.md (WS subscribe, payout math, auth smoke).
