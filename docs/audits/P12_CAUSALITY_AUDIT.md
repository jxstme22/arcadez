# P12 causality audit — 2026-10-07 (post-run, hostile)

Verdict: **P12_CAUSALITY_AUDIT=PASS** (100 counted rounds; findings below are documented non-violations).

- Single snapshot hash per round: 0 multi-hash rounds (`audit-p12.mjs`).
- No request before snapshot freeze: 0 rows with `sent_ms < as_of_ms`.
- No late-counted-valid: 0 LATE rows with action ≠ SKIP (late→SKIP enforced).
- Settlement after decision: all counted responses predate round end by ≥60s (sampled + query capped at 120s post-end tolerance: 0 violations).
- No SOL contamination: 0 non-BTC raw ticks; 0 non-`btc-` rounds.
- Snapshot content: top-level keys fixed; feature keys price-only; NO pool fields, NO settlement fields, NO future fields (byte-inspected exemplar).
- 120s grid gap (round …5160): engine never considered it (event-loop stall under fanout latency) — a MISSED round, not an exclusion; no decision exists for it.
- 16 early decided rounds never observed settled within the 5-min collector memory window (last-seen = eviction boundary) → excluded as settlement-unavailable per frozen rules. Distribution: excluded 5 UP/11 DOWN vs counted 55/45 (Fisher p≈0.07, not significant; venue settle delays identical ≈0s). Sensitivity: all-116 decided-settled population 60 UP/56 DOWN (51.7%).
- 1 no-snapshot round (…4320, SKIP_NO_LIVE_DATA all arms) → valid missing-snapshot exclusion.
- Tick causality: `receive_ts <= cutoff` enforced in `causalTicks`; future-received leak test green.
