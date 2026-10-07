# P12 freeze procedure (template — complete immediately before the live 100-round run)

P12 status: **NOT_STARTED** (requires P11 green).

## Freeze checklist

1. Record git SHA (or working-tree manifest if no git): `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('src/market.mjs')).digest('hex'))"` for each of:
   `src/market.mjs src/paper.mjs src/models.mjs src/bench.mjs src/patterns.mjs src/config.mjs src/payout.mjs`
2. Record: feature schema version (`ARCADE_DECISIONS_V0 0.1.0`), provider prompts (`INSTRUCTION` hash), model identifiers (`OPENAI_MODEL/TYPESAFE_MODEL/FASTINO_MODEL`), thresholds (`PAPER_PROB_UP/DOWN`), snapshot time rule (T-10s), safe cutoff (venue lock start−max(buffer,6000)), SKIP policy, payout formula status.
3. Write them into `docs/phases/P12_FREEZE.md` (copy this template), commit/tag `benchmark-v1`.
4. Run: `APPROVE_LIVE_SPEND=1 ... node scripts/paper-smoke-live.mjs` extended to 100 rounds (or `npm run paper` + settlement watcher). Do not edit frozen files mid-run.
5. If a critical bug is found: invalidate the run, fix, bump version, restart from round 1.

## Mid-run prohibitions

No prompt changes, no threshold tuning, no ensemble, no Pattern Lab influence (shadow only), no cherry-picking. Exclusions only for pre-registered invalidity (stale WS, malformed round, missing settlement, late response, VOID) with logged reasons.

## Outputs

`docs/phases/P12_REPORT.md`, `data/reports/p12-100-rounds.json`, `data/reports/p12-provider-comparison.csv`, `data/reports/p12-calibration.csv`, dashboard benchmark view.
