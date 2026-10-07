# Verdict

`P12_DIRECTIONAL_BENCHMARK_COMPLETE__HANDOFF_PREPARED` — 100 prospective rounds collected under frozen P12v1, hostile audits PASS, freeze intact, no edge found or claimed. Session B untouched throughout.

# P12 freeze integrity

`P12_FREEZE_INTEGRITY=PASS` — 9/9 source hashes + prompt re-match post-run; CI-enforced (79/79 tests include drift test). Post-freeze deltas (runner generalization, budget guard, docs/tests) outside frozen scope. One open spend-side anomaly documented (115 attempts/arm vs 110 cap, zero DISABLED, guard reproduces fine in isolation; impact ≤15 calls, no data bias; persistent ledger guard added).

# 100-round completion

`P12_100_ROUNDS=PASS` — 100 unique valid future BTC rounds (55 UP/45 DOWN), consecutive grid minus one 120s missed round; 17 decided-but-uncounted rounds all technically excluded (16 settlement never sighted pre-eviction, 1 no-snapshot, 1 missed, 2 pending/VOID) with distribution check (p≈0.07 n.s.) + sensitivity (GLiDE 44/95). Loop ran ~2h within approved caps modulo the anomaly above.

# OpenAI results

19 valid (81× HTTP 429 throttled, isolated, zero-retry held), 100 SKIP. p ∈ [0.49,0.50] → LOW_PROBABILITY_DISPERSION. Brier 0.2500, logloss 0.6932. Lat p50/p90/p99 561/897/1635 ms.

# Jev results

100 valid, 0 errors, 100 SKIP. p ∈ [0.46,0.52] → LOW_PROBABILITY_DISPERSION. Brier 0.2515, logloss 0.6961. Lat 535/810/1357 ms.

# GLiDE results

100 valid, 85 acted (74 UP/11 DOWN), 42/43, acc 0.4941, balAcc 0.4544, Brier 0.2965, logloss 0.8016 (worse than constant-0.5). Mean p 0.662, range [0.286,0.844]; bullish bias (UP 87% actions vs 55% base). Lat 2624/3168/4371 ms. 0 late, 0 errors.

# Baseline results

alwaysUP 55/100 (0.55, best), alwaysDOWN 45, prevCont 46/99, prevRev 53/99, mom5 48/99, mom15 48/99, mom60 43/97, p50 0 acted. Nothing beats alwaysUP; preliminary only.

# Provider probability distributions

OpenAI ~point mass 0.5; Jev ~point mass 0.49; GLiDE spread [0.29,0.84] centered 0.66. Only GLiDE shows actionable dispersion.

# Calibration findings

GLiDE 0.55–0.6: 1/3; 0.6–0.65: 3/4; 0.65–0.7: 5/8; 0.7+: 30/59 (0.508) — overconfident, no calibration signal. DOWN-side (p<0.5): 3/11. Buckets below usable support; reported as-is.

# Provider agreement findings

Never all-3-act; 15 all-abstain; GLiDE sole actor 85 (74 UP/11 DOWN). OpenAI==Jev 100/100. Per-split correctness in `p12-disagreements.csv`. Descriptive only, no ensemble.

# Causality audit

`P12_CAUSALITY_AUDIT=PASS` — single-hash rounds, no pre-freeze sends, no late-valid, settlements post-decision, no SOL, no pool/settlement fields in snapshots, tick receive-cutoff enforced. (`docs/audits/P12_CAUSALITY_AUDIT.md`)

# Fairness audit

`P12_PROVIDER_FAIRNESS=PASS` — identical input hashes, concurrent fanout, schema-only envelope differences, proven GLiDE semantics, identical thresholds/deadlines, error isolation. (`docs/audits/P12_PROVIDER_FAIRNESS_AUDIT.md`)

# Exclusion audit

`P12_RESULT_EXCLUSION_AUDIT=PASS` — every non-counted round mapped to a frozen technical class; no outcome filtering. (`docs/audits/P12_RESULT_EXCLUSION_AUDIT.md`)

# API calls

**345 attempts** (115/arm; approved caps 330/110 — see anomaly note; 0 DISABLED rows observed). Breakdown: 263 OK + 82 OpenAI-429 ERROR + 6 no-data SKIP rounds (no call).

# API spend

OpenAI ~15.6k in-tokens (~$0.0016 @ $0.10/1M). Jev 85.9k in/2.9k out; GLiDE 140.5k in/28k out (USD unknown — pricing unconfirmed). Lifetime total ≈ 411 calls incl. P11.

# PnL status

NULL (`UNAVAILABLE_NO_VERIFIED_ODDS`). No fake PnL computed.

# Session-A live harvest status

`LIVE_HARVEST_STATUS=RUNNING` — `var/live/`: 236 rounds, 12.7k ticks, 13k raw ledger rows, 3 sessions, 7 gaps tracked, 44k pool/state obs (~1s), 388 redacted trade bars. Collector + trades stream healthy.

# Session-B coordination status

`OTHER_HISTORY_SESSION=ACTIVE` — capture process running, untouched; `HISTORICAL_ROUNDS_CHECKPOINT=1692+` (growing). `ops/SESSION_COORDINATION.md` respected: no kills/restarts/merges; shared-code changes additive only. `var/history` never written by this session.

# Pattern Lab handoff status

`PATTERN_LAB_HANDOFF=WAITING_FOR_DATA` — `docs/pattern-lab/PATTERN_LAB_HANDOFF.md` updated with P12. Still needs: Session-B ≥1000 labels + DATASET-JUPITER-V2 builder step. No discovery run here.

# Tests

`npm test`: **79 passed, 0 failed** (incl. GLiDE inversion-proof, freeze-integrity, persistent-budget-guard). `npm run doctor` exit 0.

# Security audit

Forbidden-pattern grep: only allowlist guard + mock fixture + NO-WALLET string. No new secrets in evidence (reports/CSVs/audits contain probabilities/latencies only). No wallet/signer/bet/claim code. Dashboard loopback/GET-only. 345 inference calls went only to TRUSTED provider URLs.

# Remaining blockers

1. Jev/GLiDE USD pricing unconfirmed (tokens logged).
2. Payout on-chain proof open (PnL NULL by design).
3. Budget anomaly root cause unproven (guard added; spend impact negligible).
4. History <1000 (Session B active).

# Exact next command

```bash
cd /Users/welly/arcadez
npm test                  # expect 79 passed, 0 failed
node scripts/audit-p12.mjs ./var/p12-live   # expect PASS
npm run dashboard         # http://127.0.0.1:8789
tail -f var/agent-logs/sessionA-live-harvest.log   # session-A harvest
```

```text
GLIDE_SEMANTICS=PASS
P12_FREEZE_VERSION=P12v1
P12_FREEZE_VALID=YES
P12_FREEZE_INTEGRITY=PASS
P12_100_ROUNDS=PASS
P12_VALID_ROUNDS=100
OPENAI_ELIGIBLE=100
OPENAI_ACTED=0
OPENAI_SKIPPED=100
OPENAI_ACCURACY=null
OPENAI_BRIER=0.2500
JEV_ELIGIBLE=100
JEV_ACTED=0
JEV_SKIPPED=100
JEV_ACCURACY=null
JEV_BRIER=0.2515
GLIDE_ELIGIBLE=100
GLIDE_ACTED=85
GLIDE_SKIPPED=15
GLIDE_ACCURACY=0.4941
GLIDE_BRIER=0.2965
BASELINE_ALWAYS_UP_ACCURACY=0.55
BASELINE_ALWAYS_DOWN_ACCURACY=0.45
API_CALLS_TOTAL=345
API_SPEND_OPENAI_USD=0.0016
API_SPEND_JEV_USD=null
API_SPEND_GLIDE_USD=null
PNL_STATUS=NULL
P12_CAUSALITY_AUDIT=PASS
P12_PROVIDER_FAIRNESS=PASS
P12_RESULT_EXCLUSION_AUDIT=PASS
LIVE_HARVEST_STATUS=RUNNING
OTHER_HISTORY_SESSION=ACTIVE
HISTORICAL_ROUNDS_CHECKPOINT=1692+
PATTERN_LAB_HANDOFF=WAITING_FOR_DATA
```
