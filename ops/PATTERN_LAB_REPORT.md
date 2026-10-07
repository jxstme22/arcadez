# Verdict

`PATTERN_LAB_V2_REPLICATION_NULL` — V1's null persists on 23% more data with identical methodology, and the pre-registered methodology correction finds nothing qualified to select. $0 inference, Session B untouched.

# V2 source checkpoint

VACUUM INTO `var/pattern-lab/v2/source/history-checkpoint.db` (SHA `b0869ba4…`, re-verified immutable): **2569 rounds / 2564 labelled / 3615 prices**. Growth vs V1 came from historical depth (earliest 10-04 vs 10-05), not recency — V2 max round == V1 max.

# Session B status

ACTIVE (capture running; untouched — readOnly opens + one VACUUM INTO only).

# V1 freeze verification

`V1_FREEZE_INTEGRITY=PASS` (library hashes recomputed). Gap found: V1 library never persisted numeric tertile thresholds — reconstructed deterministically (frozen code + frozen V1 TRAIN) and documented; V2 persists its tertiles.

# Dataset growth since V1

Labels 2298 → 2564 (+266, all older backfill); eligible rows 1677 → 2066; price span 22h → 48h. No rows strictly newer than V1 max exist — forward-transfer test impossible; reported as n=0 INSUFFICIENT, not worked around.

# V2-R strict replication

Splits 1239/413/414; same engine/sets/K/seeds/gates/mismatch. Selection: quantile18 only (k-means filtered by support gate again). TEST: 0/414 acted, Brier 0.2487. NN: 201 acted, acc 0.4577. Scenarios ≈ base. Verdict: **V2_R_NULL_REPLICATED**. (`docs/pattern-lab/PATTERN_LAB_V2_R_REPLICATION.md`)

# V1 locked extension test

n=0 (no V2 rows strictly after V1 max) → INSUFFICIENT, per spec. Supplement (id-disjoint unseen n=389, labeled R06-SUPPLEMENT): regime 0 acted; kNN scored 154 (235 correctly embargoed — too old for any past index row), acted 89, acc 0.4831. (`research/pattern-lab/v2/unseen-transfer.json`, `extension-test.json`)

# Pattern survival

3 comparable regimes (degenerate tertiles reproduced): all COLLAPSED (deviations <0.03 both datasets). 0 SURVIVED / 0 WEAKENED / 0 FLIPPED. (`pattern-lab-v2-pattern-survival.csv`)

# Base-rate tracking

All regime rates within ±0.03 of contemporaneous base (V1 ~0.486, V2 ~0.486) → every populated regime is a BASE_RATE_TRACKER. Correct comparison is vs base, never vs 50% alone.

# kNN replication

V2-R TEST 0.4577 (worse than chance); LOO TRAIN-sample 0.58 → collapse persists (V1: 0.70→0.49). LOO still leaks via temporal autocorrelation — documented. Neighbor temporal concentration: nearest matches cluster within ±hours (same-regime bursts), noted for V3.

# Scenario replication

100–1000: mean up-frequency ≈ base (0.495 at 1000); ESS = unique sources per row. Classification: SCENARIO_BASE_RATE_TRACKER.

# Train to test generalization

Uniform collapse: logistic/tree/kNN all degrade train→test; regime vote never reaches actionable confidence on either dataset.

# V2-M preregistration

`research/pattern-lab/v2/m/PREREGISTRATION.md` (SHA pinned in TEST_FREEZE.md): Brier → balAcc → coverage → complexity → lexical; ≥20 acted validation; support gates kept.

# V2-M corrected selection

Ranking: quantile18 (Brier 0.2507, 0 acted) / treeLeaves (support fail 47<50) / kmeans (support fail). **NO_ELIGIBLE_V2M_CONFIGURATION** — the correction changes nothing; there is nothing qualified to select.

# V2-M untouched test

Not executed (no selection → nothing to evaluate; TEST looks stay at V2-R's one). Correct per prereg.

# V1 vs V2-R vs V2-M

Null / null / null → CASE A: stronger evidence against the minute/grid family. Next research belongs to 1-second microstructure, not more grid mining.

# Temporal robustness

TEST base by quarter 0.52/0.43/0.45/0.51; no method stable with deviation anywhere. (`PATTERN_LAB_V1_TEMPORAL_STABILITY.md` + V2 blocks in scorecard flow.)

# Growth sensitivity

first-500/1000/full eligibility + regime support scale ~linearly; no HIGH-support deviating regime emerges at any prefix. (`pattern-lab-v2-growth-sensitivity.csv`)

# Multiple-testing audit

9 registry rows (V2-R) + prereg-ranked V2-M; 1 TEST look each; winner's-curse disclaimed. (`PATTERN_LAB_V2_MULTIPLE_TESTING_AUDIT.md` — see V1 doc + V2 registry; V2-specific note below.)

# Leakage audit

Disjoint/chronology verified; TRAIN-only fitting (signature-level); embargoed neighbors; zero forward refs; continuation isolation; checkpoint + library hashes re-verified; Session-B isolation. (`PATTERN_LAB_V2_LEAKAGE_AUDIT.md` — see V1 doc + V2 checks above.)

# Freeze integrity

`V2_R_FREEZE_INTEGRITY=PASS`, `V2_M_FREEZE_INTEGRITY=PASS` (library hashes.txt verify; 108/108 tests include hash + ordering guards).

# Microstructure V1 handoff

`docs/pattern-lab/MICROSTRUCTURE_V1_HANDOFF.md` READY (data flowing in `var/live`; design for a future session; not a continuation of grid models).

# Tests

`npm test`: **108 passed, 0 failed** (99 + 9 V2 guards: checkpoint immutability, V1 hash verification, split parity, config parity, freeze ordering, prereg pinning, no-eligible-config, library hashes, B-storage isolation).

# Security audit

Forbidden grep: only pre-existing guard/fixture/NO-WALLET lines. 0 paid calls (Session V2 total). No secrets in new artifacts (CSVs carry aggregates; packets carry historical stats). No wallet/signer/bet/claim code. Dashboard loopback/GET-only.

# Remaining blockers

1. V2 used the only ≥2500 checkpoint; V3 awaits Session-B ≥5000 (or 10000+).
2. Future A/B needs BUDGET_GUARD_AUDIT=PASS + spend approval (budget anomaly still open elsewhere).
3. 1s microstructure is a new experiment, not covered by V1/V2 conclusions.

# Exact next command

```bash
cd /Users/welly/arcadez
npm test                  # expect 108 passed, 0 failed
node scripts/pl-build-v2.mjs   # deterministic rebuild (expect identical TEST numbers)
```

```text
PATTERN_LAB_VERSION=V2
SOURCE_CHECKPOINT=PASS
SOURCE_ROUNDS=2569
SOURCE_LABELLED_ROUNDS=2564
SOURCE_ELIGIBLE_ROWS=2066
SOURCE_FULL_CONTEXT_300S=2067
SOURCE_FULL_CONTEXT_600S=2066
V1_FREEZE_INTEGRITY=PASS
V2_R_TRAIN=1239
V2_R_VALIDATION=413
V2_R_TEST=414
V2_EXTENSION_ROWS=0
V2_R_REGIME_ACTED=0
V2_R_REGIME_ACCURACY=null
V2_R_REGIME_BRIER=0.2487
V2_R_KNN_ACCURACY=0.4577
V2_R_KNN_BRIER=0.2728
V2_R_SCENARIO_ACCURACY=null
V2_R_SCENARIO_BRIER=0.2566
V1_PATTERNS_SURVIVED=0
V1_PATTERNS_WEAKENED=0
V1_PATTERNS_COLLAPSED=3
V1_PATTERNS_FLIPPED=0
V2_M_ELIGIBLE_CONFIGS=0
V2_M_ACTED=0
V2_M_COVERAGE=null
V2_M_ACCURACY=null
V2_M_BALANCED_ACCURACY=null
V2_M_BRIER=null
V2_R_LEAKAGE_AUDIT=PASS
V2_M_LEAKAGE_AUDIT=PASS
V2_R_FREEZE_INTEGRITY=PASS
V2_M_FREEZE_INTEGRITY=PASS
PAID_MODEL_CALLS=0
SESSION_B=ACTIVE
MICROSTRUCTURE_V1_HANDOFF=READY
PATTERN_LAB_V2_READY_FOR_PROSPECTIVE_SHADOW=NO
```

`PATTERN_LAB_V2_REPLICATION_NULL`
