# P10R payout research — 2026-10-07 (live session)

Gate: **P10R_PAYOUT=PARTIAL (PNL=NULL)**. Directional benchmark unaffected.

## Pre-registered hypotheses (tested on 56 settled BTC rounds)

- H1 `feeAmount == 1% of total pool` → **FALSIFIED** (0/56 exact; observed 0–0.236%).
- H2 `feeAmount == 1% of loser pool` → **FALSIFIED** (0/56 exact).
- H3 `feeAmount is cumulative/unclaimed accrual, not per-round fee` → **UNTESTED** (needs claim/account history; corr(fee,total)=0.346 weak; 15/56 zero-fee rounds).
- H4 `paper net = stake×total/winner×0.99 (frontend gn/vn)` → **REPRODUCED_FRONTEND_OBSERVED** (direction 56/56; on-chain unconfirmed).

Evidence: `research/payout/fixtures/settled-56.json` (56 single-round GETs, ~2.1s spacing, no 429),
`research/payout/hypotheses.json`, `research/payout/verification-v2.json`.

## Conclusion

Venue `feeAmount`/`remainingPayout` cannot be derived from pools by any tested 1% rule.
Paper PnL stays NULL. Claim-level proof (read-only inspection of settlement/claim transactions
for the same rounds) is the precise missing evidence — no wallet needed, but out of scope
for this offline session. No model inference used.
