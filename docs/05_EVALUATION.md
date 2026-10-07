# Evaluation & statistical integrity

## Analysis population

One trial = one actual upcoming BTC Arcade round. Successful provider decisions may differ by arm; report full coverage/skip and matched common-eligible subset separately. Exact labels from Jupiter's confirmed opening/closing integer micro amounts; exclude VOID from binary scoring (report separately), preserve any unresolved target as `PENDING` and never fill inferred result. Do not count synthetic demo rows. No reuse of fixtures as market evidence.

## Primary metrics

- **Brier** = mean((p_up - outcome_UP)^2), smaller is better; benchmark both all valid prospective predictions and matched round subsets.
- **Log loss** with epsilon clamp (state clamp value) on same rows; no future calibration fitting.
- **Calibration**: reliability graph and predeclared buckets, e.g. [0,.1)...[.9,1]; report sample size and binomial uncertainty. Raw model estimates aren't necessarily calibrated.
- **Coverage / attempts**: how many eligible round snapshots, requests attempted, valid timely answers, late, disabled, stale, no round, and abstentions.
- **Selective accuracy**: wins / settled virtual UP/DOWN entries with coverage and confidence interval; never rank by accuracy alone.
- **Latency**: dispatch-to-receipt p50/p90/p99 per model, failure rate, deadline miss, combined common-eligible timing.
- **Economics**: only after pool snapshots, net multipliers, fee and own stake effect are precisely documented and verified. If not, mark `UNAVAILABLE_NO_VERIFIED_ODDS`; no synthetic financial success.
- **Cost**: consumed input tokens/requests by provider, estimate dollars using dated public fee schedule and provider dashboard for reconciliation.

## Statistical protocol

Use pre-registered fixed baselines: 0.5 coin flip, trailing base-rate fitted on past-only data, optionally deterministic lagged momentum rule. Compare differences **paired on same rounds**. Time-blocked confidence intervals or day-block bootstrap; record days count and effective sample size. Avoid ordinary IID 1s resampling due to temporal autocorrelation.

Prospective freeze: commit policy, feature version, model prompt, action thresholds, dataset criteria, run ID and timestamp **before** evaluation. Use immutable chronological splits: development < validation < untouched prospective holdout. If 2,000 independent future rounds aren't collected yet, say so and report only operations/uncertainty; do not manufacture a pass threshold.

## Falsification / negative controls

- Shuffle settlement labels only in **training research**, not held-out test; expected chance baseline.
- Shift source prices by 60s negative control: any huge edge likely information leak.
- Inject late received ticks into replay: exact same predictions are required.
- Inject stale/missing WS data and future source timestamps: should SKIP.
- Inject provider timeout or 429 and one arm refusal: other arms proceed.
- Cross-check target is next round, not previous/current.
- Compare by time-of-day/volatility regime to test stability, not cherry-picked best bin.

## Gates

G0 verified official GET schema and WS protocol fixtures, G1 no-lookahead/replay parity, G2 100 consecutive prospective observation slots (operational reliability only), G3 freeze inference policy, G4 2,000+ *new* valid unseen labels across multiple days for research assessment, G5 independent results report including non-result. No arbitrary “60% accuracy means launch”.
