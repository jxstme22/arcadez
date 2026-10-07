# GLiDE noul semantics (pinned 2026-10-07, M01)

- Response: `{"model":"glide","answers":{"<name>":{"type":"noul","noul":0..1,"confidence":|2·noul−1|},"usage":{...}}`.
- `noul` = P(true-criterion). Our criterion asks P(UP) → `noul` ≡ P(UP). Directional. No inversion.
- `confidence` = symmetric certainty, NEVER a probability of UP. Adapter ignores it (tested: noul 0.3 + confidence 0.4 → pUp 0.3).
- Live proof: P11 round …0540 `noul:0.39402068806898666, confidence:0.21195862386202668`; |2×0.39402068806898666−1| = 0.21195862 ✓.
- TypeSafe Jev noul identical: 0=no … 1=yes (`docs.typesafe.ai/api`).
- Fixtures: `tests/providers.test.mjs` (inversion-proof block). Verdict: GLIDE_SEMANTICS=PASS.
