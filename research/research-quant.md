# Quantitative Research Report: BTC 60s Direction Prediction
**Date:** 2026-10-08 | **Analyst:** quant-researcher (subagent)
**Data:** 214 labeled rounds (60 live + 154 historical), 101 consecutive pairs, 46 with decision snapshots, ~3000 ticks

## Executive Summary

**No statistically significant edge was found.** Across 25+ pre-registered tests covering momentum, mean reversion, autocorrelation, volatility regimes, time-of-day, streaks, microstructure consensus, and LLM predictions — nothing beats the base rate with statistical significance.

The data is consistent with: **60-second BTC direction is unpredictable noise with a slight UP bias (52.8%)**.

---

## Top 3 Candidate Edges (with honest stats)

### 1. Always-UP (base rate)
- **n=214, win rate=52.8%, 95% CI=[46.1%, 59.4%], p=0.45 vs 50%**
- Not statistically significant, but it's the highest win rate of anything tested.
- Likely reflects BTC bull regime during sample period, not a tradeable edge.
- **Verdict:** Best "strategy" by default, but the edge is unproven.

### 2. Trailing 5s momentum (bet the 5-second pre-open direction)
- **Snapshot data: n=15, win rate=80.0% (12/15), p=0.035** ← nominally significant
- **Tick replication: n=11, win rate=54.5% (6/11), p=1.0** ← not significant
- The two methods compute identical 5s returns (verified 16/16 agreement).
- The 80% does NOT survive Bonferroni correction (0.05/25 tests = 0.002 threshold).
- 95% CI for 80% on n=15 is [55%, 93%] — includes coin flip.
- **Verdict:** Most interesting lead, but likely a small-sample fluke. Needs n=100+ to validate.

### 3. Trailing 60s momentum
- **n=35, win rate=60.0%, 95% CI=[43.6%, 74.4%], p=0.31**
- Directionally positive across all three data blocks, but not significant.
- **Verdict:** Weak signal, worth monitoring.

---

## Features That Showed NO Signal (stop wasting time)

| Test | n | Win% | p-value | Verdict |
|------|---|------|---------|---------|
| Prior round continuation | 101 | 53.5% | 0.55 | Noise |
| Prior round reversal | 101 | 46.5% | 0.55 | Noise |
| Lag-1 return autocorrelation | 101 | ρ=-0.008 | — | Zero |
| Mean reversion after stretch | 18 | 38.9% | 0.48 | Noise |
| Streak reversal (2/3/4) | 100/40/18 | 46-55% | 0.48-1.0 | Noise |
| Volatility regime → direction | 24 | 54.2% | 1.0 | Noise |
| Time-of-day (Asia/EU/US) | 121/0/93 | 54.5%/—/50.5% | 0.36-1.0 | Noise |
| AGREE (Mo+Vo consensus) | 23 | 52.2% | 1.0 | **Does not replicate competitor claim** |
| Pool imbalance (crowd) | 1 | — | — | No data (pools empty) |
| Jev LLM p_up | 46 | — | — | **Zero discrimination** (outputs 0.50 always) |
| GLiDE LLM p_up | 46 | — | — | No UP/DOWN separation (Brier 0.20-0.31) |
| 14-feature kNN doors | 155 | 53.5% | — | Below base rate |

**LLM finding (critical):** Jev outputs p_up≈0.50 regardless of outcome. It is not predicting — it's abstaining. GLiDE shows slight UP bias but cannot distinguish UP from DOWN outcomes. **Shut off LLM calls for direction prediction; they add cost, not signal.**

**AGREE finding (critical):** The competitor's claimed 55-65% win rate does NOT replicate on our data (52.2%, n=23, p=1.0). Their result may be regime-specific or lucky. Do not adopt without independent validation on n=200+.

---

## Concrete Strategy Recommendation

### Strategy: "UP-Bias with 5s Momentum Filter" (MONITOR ONLY — do not deploy yet)

**Entry rules:**
1. Compute trailing 5-second return ending 10 seconds before round open.
2. If 5s return > +0.3 bps → bet UP.
3. If 5s return < -0.3 bps → SKIP (do not bet DOWN; base rate favors UP).
4. If |5s return| < 0.3 bps → SKIP (no signal).

**Rationale:** Combines the two strongest (albeit weak) findings: UP base rate (52.8%) + 5s momentum (80% in snapshot test). By only betting UP on positive momentum, we avoid fighting the base rate.

**Expected performance:** Unknown. Backtest shows 80% on n=15 but this is likely inflated. True win rate probably 52-58%.

**Deployment gate:** Do NOT deploy until n=100+ bets with win rate >55% and p<0.05. At current pace (~1 bet per 3 rounds), this requires ~300 more rounds (~5 hours).

### What to do right now:
1. **Keep the 6-arm loop running** (data collection is the priority).
2. **Add the 5s-momentum rule as a paper-only 8th strategy** (zero cost, builds the sample).
3. **Stop all LLM direction calls** (Jev/GLiDE show zero predictive power; save the money).
4. **Re-run this analysis at n=500** (estimated 2026-10-09).

---

## Statistical Caveats

- **Multiple testing:** 25+ tests were run. Expected false positives at α=0.05: ~1.25. We found 1 (5s momentum, p=0.035). This is consistent with pure noise.
- **Sample size:** 214 rounds provides 80% power to detect only large effects (>8pp above 50%). Subtle edges (2-3pp) are undetectable.
- **Non-stationarity:** Data spans Oct 1-8 across different market regimes. Results may not generalize.
- **Survivorship:** Historical rounds had 69% miss rate in harvesting. Missing rounds may not be random.

## Bottom Line

**There is no proven edge in this data.** The most honest strategy is "bet UP" (52.8%), which itself is not statistically significant. Everything else is noise.

The 5s momentum signal is the only lead worth pursuing, but it needs 5x more data before risking capital. The LLMs are expensive coin flips. The doors kNN is overfit noise. The competitor's AGREE doesn't replicate.

**Keep collecting data. Test at n=500. Don't bet real money on any of this yet.**
