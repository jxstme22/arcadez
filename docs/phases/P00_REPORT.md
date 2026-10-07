# P00 report — 2026-10-07 UTC live session

Gate: BOOTSTRAP_READY

Research: first-party OpenAPI + docs (Jupiter prediction beta, OpenAI Decisions, TypeSafe quickstart, Fastino llms.txt) + prior evidence log; unknowns enumerated (WS subscribe, payout rounding, retention).

Plan: atomic edits listed in src/config.mjs,.env.example; acceptance npm test + discover + fixture SHA.

Execute: Baseline 25/25, doctor/demo/discover/replay exit 0. No git repo, working-tree only. GSD inventoried (opencode 1.18.35). No paid calls. Touched: src/config.mjs,.env.example.

Audit: no wallet/signing, allowlist enforced, venue outcome authoritative, backfill isolated, PnL NULL, no secrets logged.

Verify: npm test 40/40 exit 0; discover roundsInSchema true; doctor exit 0; demo fixture-only; replay pass (0 live). No model calls.

Repair: 2 failures fixed (legacy venue-null fallback, live+bettable combine) with regression tests; max 3 attempts respected.

Unknowns/next: see ops/BLOCKERS.md (WS subscribe, payout math, auth smoke).
