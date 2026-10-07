# GLiDE semantics audit — 2026-10-07 (main session, M01)

Verdict: **GLIDE_SEMANTICS=PASS** — adapter reads the correct directional field; no inversion possible by construction.

## Evidence

1. Official docs (`docs.fastino.ai/concepts/decision-models`, `/inference/systemone`, verified 2026-10-07):
   Noul = "yes/no question that returns a probability between 0 and 1", "noul is the
   probability that the `true` criterion holds"; `confidence = |2 × noul − 1|` is certainty
   about *either* outcome (separate axis). Our question asks P(UP); true ≡ UP.
2. Live P11 raw replies (`var/p11-live`, e.g. round …0540):
   `{"model":"glide","answers":{"next_btc_arcade_up":{"type":"noul","noul":0.394…,"confidence":0.2119…}}}`.
   Check: |2×0.39402068−1| = 0.21195863 = returned confidence. Formula confirmed on live data.
3. Adapter (`src/models.mjs parseAnswer`) reads ONLY `answers[name].noul` after asserting
   `type==='noul'`; `confidence` is never read. Range [0,1] enforced; anything else throws
   → MALFORMED → SKIP.

## The six questions

1. Exact field: `answers.next_btc_arcade_up.noul` (plus `confidence`, `model:"glide"`).
2. 0.50 IS P(UP) — with confidence ≈0 (max uncertainty). No separate direction channel exists for noul.
3. N/A by shape: GLiDE returns noul directly, never (direction, confidence) pairs. A "UP with
   confidence 0.50" shape does not occur; if it ever did, our parser would reject it (no noul) → MALFORMED.
4. Same: normalized P(UP) always equals noul (identity); direction is never decoded from confidence.
5. `normalizeProviderResult` is correct (identity; confidence ignored).
6. All 8 P11 GLiDE actions valid: 15 UP had pUp ≥ 0.57 (min 0.58), 1 DOWN had pUp 0.394 ≤ 0.43, 4 SKIP in (0.43,0.57).

## Inversion-proof fixtures (tests/providers.test.mjs)

`{noul:0.7, confidence:0.4}` → pUp 0.7 UP (confidence ignored even when it disagrees);
`{noul:0.3, confidence:0.4}` → pUp 0.3 DOWN; missing noul / confidence-only / >1 / <0 /
wrong-type (choice) / null → MALFORMED. TypeSafe noul identical semantics (0=no,1=yes).
