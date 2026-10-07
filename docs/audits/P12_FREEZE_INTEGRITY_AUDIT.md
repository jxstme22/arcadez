# P12 freeze integrity audit — 2026-10-07 (post-run, hostile)

Verdict: **P12_FREEZE_INTEGRITY=PASS**.

- Recomputed post-run: 9/9 source hashes + prompt hash MATCH `data/benchmark/p12-freeze.json` (P12v1).
- CI-enforced (`tests/bench.test.mjs` freeze test green at 79/79).
- Post-freeze code deltas reviewed: `scripts/*` (runner generalization + persistent budget guard — execution tooling, not frozen semantics), docs, tests, dashboard, store additive migrations, WS ledger. None alter snapshot bytes, prompts, thresholds, normalization, or deadlines.
- Open anomaly (spend-side only, NOT data integrity): attempt counts (115/arm, 345 total) exceeded in-memory caps (110/330) with zero DISABLED rows, despite the guard reproducing correctly in isolation. Impact: ≤15 extra calls (≈$0.00001 OpenAI + small Jev/GLiDE tokens), no benchmark bias (all attempts prospective and valid). Persistent DB ledger guard added for future runs. Root cause unproven after deep forensics — documented, not hidden.
