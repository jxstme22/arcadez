# ARCADE PATTERN LAB V1 — 1,000 scenarios, not 1,000 fitted trading myths

**Research cut:** 2026-10-07  
**Status:** Research design; not trained, not backtested and no empirical edge claimed.  
**Input boundary:** Jupiter-native price/round/settlement and (if captured) pool observations; receive-time provenance separate from historical event times.  
**Relationship to V0:** run independently; do not change the frozen live Decisions V0 experiment midway.

## Short verdict

The idea is **testable** and there are two good versions of it:

1. **Pattern matching:** represent the recent market as a feature vector, find comparable *past states*, and estimate the frequency of UP/DOWN in their *subsequent* 60-second rounds. The Decisions API may classify a current state into a frozen human-readable regime or veto low-quality matches.
2. **1,000 future scenarios:** sample 1,000 empirically plausible paths for the future 60-second round conditioned on similar historic states. Tally how many simulated terminal prices are above vs below each path's future open. A simulation frequency is **not** a calibrated probability unless the generator has been prospectively validated.

**Do not start with 1,000 mutually exclusive pattern IDs**: with only 2,323 clean collected BTC rounds there would be 2.3 rounds per category on average; even 26,492 potential historical minute slots would supply only ~26.5 per pattern before holdouts, exclusions and evidence-of-round checks. Hundreds of choices multiply chances of finding misleading in-sample 'winners'.

## 1. What is a pattern?

A pattern is a reproducible encoding of a recent, observable market state, **not** a post-hoc verbal description of a winning round. For snapshot `t < upcoming round start`:

```
X_t = [ret_5s, ret_15s, ret_30s, ret_60s, ret_180s,
       realized_vol_30s, realized_vol_60s, range_60s,
       momentum_acceleration, flip_count_60s, breakout_reversion,
       feed_age_ms, coverage_60s,
       OPTIONAL: available pre-lock pool_imbalance, pool_velocity]

y_t = UP/DOWN outcome of the NEXT Arcade round (strict future open-to-close sign)
```

Normalize returns/volatility in bps; compare only like-for-like features with robust rolling normalization fitted on the **training past**. Never use future round open price as a feature prior to open. Never use settlement, final multiplier, or later exchange data as inputs to a historical decision. Missing data must not be silently filled.

## 2. Recommended three-layer research engine

### Layer A: small, frozen structural regimes

Start with 8, 16, then 32 broad groups. Candidate axes: trend sign/strength (up/down/flat), volatility (quiet/normal/shock), momentum transition (accelerating/weakening/reversing), and quality (fresh/degraded, where degraded forces SKIP). Implement clustering on **inputs only**, without labels; compare simple rules, robust k-means, and optionally a hidden Markov model as distinct pre-registered approaches. Do not define clusters from next-round winners.

### Layer B: similar-past neighbor retrieval

Within an admitted group, compute nearest neighbors across prior snapshots with standardized numerical features (cosine/Euclidean/Mahalanobis, preregistered). Restrict neighbors to earlier dates and non-overlapping label windows. Enforce a minimum effective sample size, e.g. 100–200 independent rounds as an exploratory default, and emit `INSUFFICIENT_SUPPORT` otherwise. Estimate `p_up` by recency-weighted sample frequency with shrinkage toward global base rate; report effective N and uncertainty interval, never raw win percentage alone.

### Layer C: 1,000 possible futures

Condition on matched historical precursor states, draw empirical future return paths (e.g. full 60-second blocks rather than treating seconds as independent), optionally stratify by volatility and time context. Each simulated path has an internally consistent opening boundary and next 60-second close. Run 1,000 simulations **per candidate state as a research knob**, returning the distribution of direction, move magnitude and maximum excursion. Do not train or select the best generator on the held-out test data. A fitted generator can produce 1,000 near-identical wrong futures: scenario count measures simulation resolution, **not information gain**.

Illustration only:

```
Current price state (T-10s; upcoming open still unknown)
    ↓
Regime R12 (quiet upward trend, momentum fading)
    ↓
Neighbour search: 180 eligible prior examples
    ↓
1000 conditional empirical paths sampled from eligible examples
    ↓
590 UP / 410 DOWN in simulations  <-- simulation frequency, not reliable 59% live odds
    ↓
Calibration/uncertainty/market quote gate
    ↓
UP / DOWN / SKIP (paper only)
```

If using historical future 60s price traces, these are allowed **only as training labels/path examples** for past rounds; they must never be inserted into the *current* feature vector before the real event.

## 3. How to use all three decision models correctly

Decisions, Jev and GLiDE are each suited to **bounded classification tasks**. It does not do efficient 1000-row nearest-neighbor search for you and does not automatically learn the statistical mapping from BTC patterns to future returns. Numeric discovery, neighbor retrieval, scenario resampling, probability calibration and EV math belong in deterministic/statistical code.

Two admissible experiments, tested against numeric-only controls:

**Variant 1 — Three-model V0 (separate, no ensemble):** Jupiter feature snapshot -> independent OpenAI predicate / Jev noul / GLiDE noul -> per-model calibrated estimates -> identical paper gates. Historical Pattern Lab must not change or retrain these arms during the locked evaluation.

**Variant 1a — OpenAI-only reference:** Jupiter feature snapshot -> Decisions `predicate` (NEXT round UP) -> calibrated estimate -> paper gate.

**Variant 2 — Pattern + Decisions classifier (after freeze):** causal feature snapshot + 3–5 candidate regime definitions (chosen by numeric retrieval) -> Decisions `choice` classify one of `R01`...`R16` plus `NONE` -> numeric empirical support and conditional `p_up` -> paper gate. This choice is **not** a demonstration that the AI learned to predict BTC. The `choice.confidence` is confidence about its classification, not the next-round win probability.

**Variant 3 — Numeric pattern only:** exact same retrieval and calibration, no AI. This is necessary to determine whether Decisions adds anything beyond a straightforward statistical model.

**Variant 4 — Pattern + Decisions veto:** numeric classifier predicts and computes EV; the Decisions model rates data/regime consistency, optionally vetoes. Must beat Variant 3 prospectively to justify its use.

Jev and GLiDE are required **V0 independent benchmark arms**. At Pattern Lab V1, include pattern+OpenAI, pattern+Jev, pattern+GLiDE as separate pre-registered experimental arms ONLY after the same numeric-only Pattern Lab baseline is frozen. Never add an ensemble before standalone paired results exist. Pattern classification and directional probability are distinct questions.

**Example frozen question for classification**:

```json
{
  "model": "gpt-6-luna",
  "input": "Jupiter-origin pre-lock feature JSON and 3 candidate regime definitions, all frozen and serialized as of timestamp t.",
  "questions": [{
    "type": "choice",
    "name": "market_regime",
    "instructions": "Classify the input into the closest matching regime based on observable feature definitions. If evidence is absent, ambiguous or stale, choose NONE. Do not use or infer the future round outcome.",
    "choices": [
      {"value":"R03","description":"Quiet upward momentum fading: regime thresholds from versioned config"},
      {"value":"R12","description":"Volatility expansion with choppy returns: regime thresholds from versioned config"},
      {"value":"R14","description":"Downward momentum accelerating: regime thresholds from versioned config"},
      {"value":"NONE","description":"No defensible match or stale/incomplete data"}
    ]
  }]
}
```

Descriptions must be filled with the **actual frozen numeric definitions**, not vague English shown in this illustration. Avoid allowing a model to see future match statistics and then retrospectively invent a category. For a winning-probability assessment, use separate `predicate` evaluation or the empirically measured frequency plus explicit calibration.

## 4. Chronological research protocol

1. **Inventory and audit:** harvest and audit new Jupiter-native raw data independently in the clean-room repository (prior R7 reports for background only, no old database import); distinguish `LIVE_CAPTURED`, `SETTLEMENT_VERIFIED`, `SOURCE_REPRODUCED`, `HISTORICAL_RETRIEVED`, `ROUND_EXISTENCE_UNPROVEN` and `OUTCOME_UNKNOWN`.
2. **Backfill:** query Jupiter candle/bulk history where validated; if only single-second lookup is viable, do a bounded, cached and rate-safe sampling schedule. A 30-day × 1Hz fetch would be ~2.6M requests; don't launch that blindly. Keep byte-level raw responses and request/receive timestamps (historic download time distinct from historic event time).
3. **Establish round existence and labels:** the R7-SV2 report's ~26,492 slots are *potential*, not all observed as live markets. A reconstructed direction should carry `VERIFIED_SETTLEMENT_SOURCE_DERIVED`, not the same status as a directly settled confirmed round. Filter uncertain sessions; independently audit stratified subsamples.
4. **Build causal pre-lock snapshots:** for real recorded prospective data use **arrival-time as-of**. For historical time-stamped data, label it `HISTORICAL_REPLAY_ASSUMPTION` because availability at t is unproven; require prospective confirmation.
5. **Freeze initial 16 regime definitions** without looking at future labels. Save feature transforms, random seeds and corpus checksums. Do no pattern-library regeneration on the held-out test period.
6. **Train with chronological partitions**: e.g. oldest 60% train, next 20% validation, latest 20% untouched test; use a further live prospective period after selecting the model. Embargo between partitions to avoid overlapping feature and outcome windows (start with at least longest lookback + target horizon, e.g. 300s+70s; verify exact window semantics). Report daily/weekly breakouts.
7. **Predetermine candidate count** (e.g. 8/16/32 groups; 2 numeric retrieval methods; 2 calibration methods). Log *all* tested variants and feature changes; multiple-testing correction / selection bias diagnostics. Don't search 1000 strategies then announce the best as a discovery.
8. **Compare control arms on identical rounds**: always-UP / always-DOWN / empirical base rate / logistic price-only baseline / deterministic momentum / numeric-pattern baseline / Decisions-only / numeric-pattern+Decisions.
9. **Score**: Brier, log loss, calibration curves, accuracy by bucket, sample size, uncertainty, coverage, SKIP rate, payout-based net EV (only if historical entry-time payout was captured), and block-bootstrap confidence intervals for superiority. Avoid drawing claims from tiny high-confidence buckets.
10. **Freeze before paper validation**; run V0 live with independent versioned pattern arm. Never retroactively insert missed real trades or select only successful patterns.

## 5. Research kill criteria

Reject/discard a candidate variant if any of these is true:

- It needs post-decision information, unproven observation times or rounds with non-evidenced existence.
- It finds apparent edge only within one contiguous short volatility regime or on the same data used to select it.
- Its samples per pattern are too small to estimate directional frequency robustly.
- Its calibration is worse than the base-rate or logistic baseline on untouched holdouts.
- Its 95% uncertainty interval for net profitability includes an economically unacceptable loss, or executable pre-lock odds cannot be measured.
- It fails prospective repeated measurement or changes regime identities after seeing the outcomes.

Academic warning: repeated testing of hundreds of financial strategies can produce false discoveries even when every individual strategy looks convincing in sample. See Bailey & López de Prado, *How “Backtest Overfitting” in Finance Leads to False Discoveries*, Significance (2021): https://academic.oup.com/jrssig/article/18/6/22/7038278

## 6. Suggested phased milestones

| Milestone | Research work | Gate |
|---|---|---|
| P0 | Recover exact Jupiter read-only contracts and data provenance | Verified schema and saved fixtures |
| P1 | Price/settlement historical harvest + existence ledger | Coverage and labelled quality audited |
| P2 | Feature construction and no-leak replay | Causal/assumption provenance verified |
| P3 | 8/16/32 frozen pattern regimes, kNN analog matching | Effective sample size and frozen mapping |
| P4 | 1,000 **conditional** future path scenarios | Generator sanity + historical holdout scores |
| P5 | OpenAI/Jev/GLiDE vs numeric-only and independent pattern-augmented arms | Test-set comparative calibration and uncertainty |
| P6 | Prospective shadow/paper A/B with Jupiter V0 | No changes to frozen core mid-test |

## 7. Example build-agent prompt

> Create a new `arcade-pattern-lab` research namespace; do not import from old repos or modify the frozen live V0 benchmark. First inventory historical Jupiter-native price, round-existence, pool and independently verified settlement sources. Classify provenance per round; never turn a price-service timestamp into a fictional venue round. Capture bounded historical data with rate limiting and immutable raw bytes.
>
> Encode past-only numeric market-state features; implement 8/16/32 frozen regimes, nearest historical analogues with effective sample size, shrinkage and uncertainty, then an optional 1,000-scenario conditional path sampler. Keep all dynamic output as *forecasts*, not ground truth. Build time-ordered, embargoed train/validation/test splits; log all tries and avoid lookahead. Require deterministic numeric-pattern/no-AI control and compare against Decisions-only using identical eligible rounds. Jev and GLiDE are already present as V0 benchmark arms; do not include unvalidated historical features in the frozen V0 live snapshots. Do not claim victory from an attractive pattern number, from an in-sample success rate, or from unobserved retrospective odds. Deliver provenance, reproducible tests, honest failure cases, figures/tables and a go/no-go research verdict.

## 8. Final interpretation

It is useful to give patterns IDs (`R12`, `M726`, etc.) for inspection and model classification. The IDs are **addresses in a reproducible pattern dictionary**, not proof that a market will follow a known script. `Pattern 726 -> UP` is a hypothesis to be evaluated with dated, held-out outcomes, effective sample size, uncertainty and actual payout. In a sensible architecture, the AI recognizes/criticizes a market state; statistics estimate the conditional outcomes; the payout/risk gate decides whether an entry is worthwhile.
