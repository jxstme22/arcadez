# Pattern Lab V1 — historical regimes, neighbor matching, 1,000 paths

The owner's Pattern #726 idea is a **testable research hypothesis**, not proof that patterns are stable. Even 26,000 rounds would leave only ~26 observations per each of 1,000 equally frequent exclusive classes, before chronological train/validation/test splits and data quality filters. Do **not** start by mining 1,000 independent winning rules. Build interpretable multi-layer pattern retrieval.

## Data acquisition ladder

1. Capture ongoing Jupiter live WS ticks and /play rounds, venue settlement and pool snapshots now; no hindsight availability confusion.
2. Probe Jupiter price-service timestamp history and candles for a bounded range, log query and received_at. Historical prices go into `HISTORICAL_BACKFILL`, never a live snapshot.
3. Attempt historical round existence proof by venue record / verified onchain transactions; mark `VENUE_RECORDED`, `ONCHAIN_VERIFIED`, `SOURCE_REPRODUCED`, `INFERRED_EXISTENCE`, `UNKNOWN` distinctly. No automatically minted minute labels.
4. Build features only from prices at or before historical cutoff, while noting **historical availability is reconstructed, not proven**. Never score them as live-timely signals.

## Layer A: 16–32 causal structural regimes

Define classes from pre-cutoff price-only features: lagged 5/15/30/60s return sign/trend; volatility low/med/high based on *past-only* rolling quantile; reversal count, range expansion, momentum acceleration/decay and source freshness. All thresholds fixed on training data. Use minimum support and hierarchical shrinkage to parent regime and base rate. IDs stable versioned hash of deterministic rules, not arbitrary fit after holdout review.

## Layer B: similar-past retrieval

Normalize lagged feature vectors using training-only means/std; distance metric from training fold only; time-embargo neighbors close to evaluation timestamp; select k neighbors with minimum support, report effective sample size and class balance; no future date neighbor for a historical decision. Estimate UP frequency with Bayesian shrinkage, not naive 100% confidence from five matches.

## Layer C: plausible future paths

Sample up to 1,000 60s return paths conditioned on matched states using bootstrap of *past-only* 60-second realized price paths. Preserve empirical volatility, directional autocorrelation and gap blocks as possible; never simply draw 1,000 independent fair coins to claim forecasting. Return `simulated_up_fraction`, effective sample count, quantile bands, downside regimes and uncertainty. Scenario percentages **are not calibrated probabilities** until prospective outcome validation. Record RNG seed, training hashes and scenario definitions.

## Classifier usage and A/B arms

A0 baseline price-only; A1 OpenAI Decisions V0; A2 Jev; A3 GLiDE; A4 numeric pattern library alone; A5/A6/A7 identical pattern context passed to each model. All arms share one snapshot cutoff but pattern-informed arms are a separately versioned experiment. A model might classify which historical regime fits, *not* invent or select pattern #726 based on known future outcome. Attribute gain via paired comparison against numeric A4 and no-pattern A1/A2/A3.

## Anti-overfit protocol

All hyperparameters, 16–32 regime definitions, candidate pattern count and neighbors k chosen on development fold; chronological purged validation; strictly untouched future period reserved. Never search 1,000 patterns and report the maximum winning rate without multiple-testing correction. Use false-discovery correction or nested validation, run downside/fees and negative controls, stop if no statistically credible improvement. Publish counts for all rejected hypotheses, not just winners.

No Pattern Lab inference should block prospective V0 data collection. See companion original `docs/ARCADE_PATTERN_LAB_V1.md`.
