# TRIAD Regime System

Three detectors + one router for 60s BTC prediction. Pure price action, zero model calls.

## The Detectors

**storm-SD (STORM-DOWN):** Bet DOWN when:
- 60s momentum <= -3 bps (price crashing)
- Micro-volatility >= trailing median (high-vol regime)
- 15s pre-lock push also negative (confirmation)

**sky-SU (SKY-UP):** Mirror. Bet UP when:
- 60s momentum >= +3 bps
- High-vol regime
- 15s push positive

**calm-CS (CALM-SKIP):** Regime flag. Always SKIP, but signals when vol < 0.7*median.
In calm markets, momentum mean-reverts (36% win rate) — sit out.

## The Router

**triad-TD:** Unified decision.
1. CALM? → SKIP
2. STORM + SKY both? → SKIP (conflict)
3. STORM only? → DOWN
4. SKY only? → UP
5. Neither? → SKIP

**triad-HR:** High-risk variant. Looser thresholds (2bps, 0.8*vol, no push confirm).
More bets, lower win rate expected.

**kalman-KF:** Kalman-filtered TRIAD. Same regime logic, but momentum from a
Kalman filter tracking [price, velocity] through tick noise instead of raw diffs.

## Research

See `research/` for the three professional research reports that led to this design.
Key finding: 60s BTC direction is mostly noise; the only edge is in regime-selected
high-vol momentum (STORM-DOWN: 65-87% in testing).
