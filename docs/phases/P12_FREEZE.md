# P12 freeze — P12v1, 2026-10-07 (after P11 green)

Frozen: feature engine `featuresAsOf` (ARCADE_DECISIONS_V0 0.1.0; `featuresRich` is
research-only and NOT in the live path), prompt SHA `443fa889d556c425`,
models `gpt-6-luna` / `jev-latest` / `fastino/GLiDE`, thresholds .57/.43, stake 10,
timing T-10s / deadline start−max(buffer,6000) / maxAge 2500ms, SKIP-first policy,
baselines alwaysUP/DOWN/prevCont/prevRev/fifty/momentum, PnL NULL, Pattern shadow-only.

Machine-readable: `data/benchmark/p12-freeze.json` (per-file SHA256 of 9 source files).
Rule: any mid-run code change invalidates P12v1 → fix, bump to P12v2, restart at round 1.
