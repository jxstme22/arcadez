# P12 result exclusion audit — 2026-10-07 (post-run, hostile)

Verdict: **P12_RESULT_EXCLUSION_AUDIT=PASS** (all exclusions technical and pre-registered).

Counted: 100 rounds (55 UP / 45 DOWN), consecutive grid with one 120s gap.
Not counted (all with documented technical reason, none outcome-based):

| Rounds | Reason (frozen valid-exclusion class) |
|---|---|
| 16 early decided (…3900–…4800) | settlement never observed within 5-min collector memory window (last-seen = eviction boundary) → settlement-unavailable |
| …5160 | never considered (event-loop stall under fanout latency) → missing canonical snapshot |
| …4320 | no fresh ticks → SKIP_NO_LIVE_DATA all arms → missing canonical snapshot |
| …0920, …1740-era + others | pending/VOID at observation close (2 null-result rounds in DB) → missing settlement / VOID |

- No losses removed: counted set includes all GLiDE 43 losses and every SKIP.
- No confidence filtering, no bias filtering, no post-hoc outcome filtering (Fisher check on excluded-vs-counted outcomes p≈0.07, n.s.).
- Sensitivity: full decided-settled GLiDE 44/95 ≈ 0.463 — same no-signal conclusion as counted set (42/85 ≈ 0.494).
