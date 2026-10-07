# P10 report — 2026-10-07 (live session)

Gate: **P10=PARTIAL (WS=PASS, PAYOUT=PARTIAL)**.

- WS: protocol reverse-engineered from production bundle and verified live (snapshot + ~1Hz `btcusdt` ticks); 10.3-min verification 981 frames / 589 valid ticks / 0 SOL / 1 forced reconnect recovered → PASS. See `docs/phases/P10_WS_REPORT.md`, `research/ws/PROTOCOL.md`, `research/ws/verification.json`.
- Payout: frontend formula reproduced exactly (`total/winner`, ×0.99, feeBps 100); 20 settled fixtures match price direction 20/20; on-chain `feeAmount` semantics unexplained → PnL stays NULL. See `docs/phases/P10_PAYOUT_REPORT.md`, `research/payout/verification.json`.
- Tests 47/47. New files: `src/ws.mjs`, `src/payout.mjs`, `scripts/verify-ws.mjs`, `tests/ws-payout.test.mjs`.

P11 may proceed direction-only (PnL NULL).
