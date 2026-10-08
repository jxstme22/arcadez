# Microstructure Research: 60-Second BTC Prediction Rounds

**Date:** 2026-10-08 · **Analyst:** microstructure subagent
**Data:** 138 labeled rounds with tick coverage (8 block DBs, ~7,900 ticks at ~1/sec),
Jupiter BTC 60s prediction rounds. Decision time D = round open − 6s (bets lock ~4–5s before open).
Base rate in sample: 46.7% UP / 53.3% DOWN.

All features computed strictly from data available at D (no lookahead). One caught
lookahead artifact is documented below.

---

## 1. What is NOISE (honest nulls)

| Hypothesis | Test | Result |
|---|---|---|
| Order-flow imbalance (tick direction) | Fraction of up-ticks minus down-ticks, last 20 ticks, thresholds 0.2–0.5 | 43–50% — **no signal, slightly anti-predictive** |
| Dollar flow (signed tick magnitudes) | Sum of signed bps moves, last 30s | 44–49% — **no signal** |
| Micro-volatility level | Mean abs tick change 60s vs prior 60s (ratio) | 48–51% either direction — **no directional signal** |
| Acceleration (2nd derivative) | ret(last 20s) − ret(prior 20s) | 47.7% at 2bps; 56% at 4bps (n=16, noise) — **no signal** |
| 5-tick weighted vote (arcade-oss Vo) | Weights 1–5, flat-tick poisons | 50.4% (n=119) — **no edge in this feed** |
| Mo+Vo agreement (arcade-oss AGREE) | Both legs agree | 48.5% (n=68) — **worse than momentum alone here** |
| Round-open gap | Venue open vs feed 1s before open | 83% continuation (n=6) — **LOOKAHEAD ARTIFACT** (venue open price not known at D). The tradeable version (9s pre-lock push) shows **no signal** (52.9%, decays with threshold) |

The tick feed is ~1/sec quote midpoints, not true order flow — this likely explains
why flow-based features fail. The market at this resolution is mostly quote bounce.

## 2. What WORKS

### 2a. 60-second momentum (Mo) — small but monotone
Bet the direction of `price(D) − price(D−60s)`:

| Threshold | W–L | n | Accuracy |
|---|---|---|---|
| ≥1 bps | 47–42 | 89 | 52.8% |
| ≥2 bps | 34–29 | 63 | 54.0% |
| ≥3 bps | 24–20 | 44 | 54.5% |
| ≥5 bps | 8–6 | 14 | 57.1% |
| ≥8 bps | 4–2 | 6 | 66.7% |

Monotone improvement with threshold — the signature of a real (small) edge, not noise.
Typical |Mo| is tiny: median 1.8 bps, p90 5.0 bps.

### 2b. Momentum DECAYS fast — edge lives in the first 15 seconds
Betting Mo direction, scored against price-vs-strike at horizons into the round:

| Mo filter | +15s | +30s | +45s | +60s (result) |
|---|---|---|---|---|
| ≥2 bps | **58%** (64) | 52% | 56% | 55% |
| ≥3 bps | 55% (44) | 50% | **59%** | 55% |

The edge is strongest immediately after open and fades — classic microstructure
momentum decay. The 60s round outcome is a noisy proxy for a ~15–30s phenomenon.

### 2c. Violent DOWN asymmetry
At Mo ≥ 3 bps: **DOWN bets 60.9% (n=23) vs UP bets 47.6% (n=21).**
Downward momentum continues; upward momentum does not. Economically sensible:
crypto sell-offs are urgent (liquidations, panic), rallies are slow grinds.

### 2d. Volatility regime gate — the big one
Split by pre-open micro-volatility (median split):

| Mo ≥ 3 bps in… | Accuracy |
|---|---|
| High-vol regime | **60.6%** (n=33) |
| Low-vol regime | 36.4% (n=11) |

In high-vol, moves are real order flow → momentum persists. In low-vol, moves are
quote bounce → momentum mean-reverts. (Low-vol n is small; treat as directional.)

### 2e. Supporting: momentum works when microstructure isn't choppy
Low alternation rate (trending ticks) + Mo ≥ 2 bps: **56.3%** (n=32). Consistent story.

## 3. THE SIGNAL: high-vol DOWN momentum ("STORM-DOWN")

Composite — bet DOWN only when ALL hold at decision time D:

1. **Mo ≤ −3 bps** — price fell ≥3 bps over [D−60s, D]
2. **High-vol regime** — mean abs tick change over last 60s ≥ trailing median
3. *(Optional confirmation)* **Pre-lock push agrees** — return over [open−15s, D] also negative

| Variant | W–L | n | Accuracy | z |
|---|---|---|---|---|
| Mo≤−3, hivol → DOWN | 11–3 | 14 | **78.6%** | 2.14σ |
| + push agrees → DOWN | 9–2 | 11 | **81.8%** | 2.11σ |
| Walk-forward (expanding vol median, no threshold lookahead) | 13–7 | 20 | **65.0%** | 1.34σ |

Control: "bet DOWN in high-vol" *without* momentum is 53.6% — the momentum does the work.
"UP momentum in high-vol" is 47.4% — the edge is DOWN-only.

**Caveats (read before deploying):**
- n=14 in-sample; 2.14σ clears 2σ but not Bonferroni (~40 signals tested).
- Walk-forward drops to 65% — expect real-world 60–65%, not 78%.
- Sample is DOWN-leaning (53.3% base); part of the DOWN edge is regime.
- Thresholds (3 bps, median vol) were fit in-sample → forward validation required.

## 4. Pseudocode

```
# runs at D = round_open_ms - 6000, every round
# inputs: ticks[] (ts, price), vol_median (trailing, e.g. last 50 rounds)

def decide(round_open_ms, ticks, vol_median):
    D = round_open_ms - 6000
    pD   = last_tick_at_or_before(ticks, D)
    pD60 = last_tick_at_or_before(ticks, D - 60000)
    if pD is None or pD60 is None: return SKIP("no_data")

    mo_bps = (pD - pD60) / pD60 * 1e4

    # micro-volatility: mean abs 1s tick move over last 60s, in bps
    vols = []
    for s in 0..59:
        a = last_tick_at_or_before(ticks, D - s*1000)
        b = last_tick_at_or_before(ticks, D - (s+1)*1000)
        if a and b: vols.append(abs(a-b)/b * 1e4)
    if len(vols) < 30: return SKIP("thin_feed")
    vol_now = mean(vols)

    # optional confirmation: pre-lock push over [open-15s, D]
    pA = last_tick_at_or_before(ticks, round_open_ms - 15000)
    push_bps = (pD - pA)/pA*1e4 if pA else None

    if mo_bps <= -3.0 and vol_now >= vol_median:
        if push_bps is None or push_bps < 0:
            return BET_DOWN   # STORM-DOWN
        return SKIP("push_disagree")
    return SKIP("no_setup")

# expected behavior: acts ~10-15% of rounds, targets 60-65% win rate
# SKIP is the default position; never force a bet
```

## 5. Recommended next steps

1. **Forward-validate STORM-DOWN** on live paper for 50+ acted bets before trusting it.
2. **Vol median**: use expanding trailing median (walk-forward showed 65%); recompute per block.
3. **Do not use** flow/dollar-flow/acceleration/Vo/gap features — measured nulls.
4. Consider a **15–30s horizon instrument** if the venue ever offers it — the edge decays by 60s.
5. Revisit if BTC enters a sustained UP regime — the DOWN asymmetry may be regime-dependent.

## Appendix: method notes

- Ticks deduped, sorted; `priceAt(ts)` = last tick ≤ ts (binary search).
- Tick spacing: p50 = 1000ms, p99 = 2000ms — feed is healthy.
- 7 of 144 rounds lacked tick coverage at D−60s and were excluded.
- Scripts: `/tmp/micro/micro.mjs` (features + round 1), `micro2.mjs` (tradeable round 2),
  `micro3.mjs` (timescale/decay + regime splits). Feature table: `/tmp/micro/features.json`.
