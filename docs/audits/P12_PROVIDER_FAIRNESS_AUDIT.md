# P12 provider fairness audit — 2026-10-07 (post-run, hostile)

Verdict: **P12_PROVIDER_FAIRNESS=PASS**.

- Same snapshot_id + input_hash across arms every round (0 mismatches); concurrent `Promise.all` fanout — no arm's output visible to another before dispatch (single shared input object, responses stored post-hoc).
- Wire envelopes differ only as API schemas require (OpenAI string `input` vs System-One `state` object); semantic JSON identical (same hash).
- GLiDE semantics proven (M01): `noul` directional; confidence never decoded; inversion fixtures green on live shapes.
- Thresholds identical (.57/.43) and frozen; no per-arm tuning (OpenAI/Jev 0 acted, GLiDE 85 acted is emergent behavior, not configuration).
- Error isolation: OpenAI 429s affected only OpenAI rows (82 ERROR); Jev/GLiDE 0 errors, uninterrupted. No cross-arm fallback or retry theft (zero retries globally).
- Deadlines identical per round (`venueLockMs` shared); LATE→SKIP uniform (0 late rows total).
