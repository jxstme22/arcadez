# P10 payout report — 2026-10-07 (live session)

Gate: **P10_PAYOUT=PARTIAL (formula reproduced, on-chain fee UNVERIFIED, PnL stays NULL)**.

## Research

- Production bundle `https://jup.ag/assets/arcade-c0dHAUTl.js` (83KB, fetched 2026-10-07): `gn({upPool,downPool})` → total=up+down; total zero → `{1,1}`; winning side zero → `null`; else `total/winnerPool`. `vn(round,position)` → `stake × gross × 9900/1e4` (matches `feeBps 100` from `/play/config`). Display `toDecimalPlaces(2)+'x'`, one-sided → `Only the Down/Up pool had bets` + VOID path. Raw saved `research/ws/raw/arcade1.js`.
- Live config: `feeBps 100`, `settlementDecimals 6`, limits in micro USDC. 20 settled BTC rounds fetched (`research/payout/fixtures/settled-20.json`): all venue outcomes match exact micro price direction (20/20). `feeAmount` values ≈0.02–0.3% of pool total (e.g. 129504 on 92.96M), NOT 1% — semantics unknown (possibly unclaimed dust/accrual, not per-round fee).

## Execute

- New `src/payout.mjs`: `computeGrossMultiplier` (exact frontend formula, integer-safe), `computeNetPayout` (rational 9900/10000 floor, null unless reason OK), `computePaperPnL` (lost→−stake; won→payout−stake; else null; reason always carries `ONCHAIN_FEE_UNVERIFIED`). Tests in `tests/ws-payout.test.mjs` incl. empty/one-sided→null.
- Verification `research/payout/verification.json`: 20 rows with pools, gross multipliers (e.g. 117.42M/65.42M=1.795 UP), $10-stake net payouts, feeAmount column, mismatch count 0.

## Audit

- No wallet/signing/claim code added. Functions are pure arithmetic, no model calls. Live DB `paper.pnl_usdc` untouched (still NULL, `UNAVAILABLE_NO_VERIFIED_ODDS`). Dashboard/doctor label payout `FRONTEND_FORMULA_REPRODUCED_ONCHAIN_FEE_UNVERIFIED_PNL_NULL`.

## Missing evidence for full VERIFIED

1. Meaning of `feeAmount`/`remainingPayout` per settled round (observed ≠ 1% total).
2. Rounding rule (frontend float `.toNumber()` vs integer floor) at claim time.
3. A settled claim transaction tying computed payout to on-chain transfer (read-only inspection only, no wallet).

Until then: `pnl=NULL, payout_status=UNVERIFIED`. P11 may proceed direction-only.
