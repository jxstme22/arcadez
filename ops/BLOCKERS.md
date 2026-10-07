# Blockers — updated live run 2026-10-07

1. **BLOCKED_WS_WIRE (was BLOCKED_WS_PROTOCOL_LIVE):** `wss://prediction-market-price-service.fly.dev/ws/crypto` connects (OPEN ~1.7s) but yields 0 frames in 12s without subscribe. `JUPITER_PRICE_WS_SUBSCRIBE_JSON` empty, no verified subscribe shape. Collector saves raw frames and takes zero ticks → paper SKIP. **Next:** observe first-party frontend WS send (bounded, public bundle) or official docs; add fixture + `normalizeTick` adapter + test. Do not fabricate subscribe.
2. **BLOCKED_PAYOUT_TRUTH:** pools/fees observed (`upPool/downPool/feeAmount feeBps 100`) but pre-lock quote timing, fee rounding, own-stake impact unverified. `pnl_usdc` NULL by design. **Next:** capture pre-lock pool snapshots + settled payout for same rounds, prove multiplier math with exact-match test before enabling PnL.
3. **BLOCKED_AUTH_SMOKE (operator-controlled):** OpenAI/TypeSafe/Fastino adapters offline-verified (40/40 incl. 401/429/timeout/malformed/late/budget). Zero live calls this session per spend-cap instruction. Keys present locally (lengths 164/107/69) but must not be used until operator sets provider-side caps and explicitly approves. **Next:** after wake, `npm run doctor`, then single bounded paper round to observe `OK/LATE/ERROR` per arm.
4. **PARTIAL_HISTORICAL_RETENTION:** timestamp price GET verified (`symbol,timestamp ms,value`), harvest bounded (`--step/--limit`, 2.1s spacing, `HISTORICAL_BACKFILL` isolated). Round-existence for old minutes via `/rounds/{asset}/{openTs}` spot-checked (one settled), not bulk-harvested. **Next:** bounded backfill manifest + coverage matrix; never feed to live features.
5. **NO_GIT_REPO:** `/Users/welly/arcadez` is not a git repository. Changes are working-tree only; no atomic commits possible. **Next:** operator may `git init` + baseline commit if desired; do not push externally without instruction.

**Cleared this session:** `BLOCKED_JUPITER_OPENAPI_LIVE` → VERIFIED (openapi 3.0.0, 7 read-only `/play` GETs, `roundsInSchema true`). `BLOCKED_ROUNDS_400` → FIXED (timeline requires `?asset=BTC&before=&after=`; config + collector updated, `.env` patched). `WRONG_TARGET_RISK` → HARDENED (venue outcome authoritative, next-round-only, venue lock 6s).

## P10→P12 session updates (2026-10-07 ~11:35 UTC)
- CLEARED: WS subscribe/frame protocol → VERIFIED (snapshot + ~1Hz btcusdt, 10-min pass). Collector now subscribes explicitly.
- PARTIAL: payout formula reproduced (gross+0.99) but on-chain feeAmount unexplained → PnL NULL remains.
- NEW GATE: P11 live smoke needs explicit spend approval (AGENTS.md rule 9). Script `paper:smoke20` exits BLOCKED without APPROVE_LIVE_SPEND=1. 0 calls made.
- P12 NOT_STARTED (needs P11 green + freeze).

## Master continuation updates (2026-10-07 ~12:30 UTC)
- P11A contracts re-verified vs current docs (all unchanged; Fastino 425/503 + confidence formula newly pinned).
- P11B/C + P12 remain blocked: APPROVE_LIVE_SPEND absent (process env + .env). Gate re-verified BLOCKED, 0 calls.
- P10R: 1% fee hypotheses falsified on 56 rounds; missing evidence = claim/account inspection (H3).
- P13 foundation built on 120-round single-window history; gated regimes 0 → INSUFFICIENT_SAMPLE. Needs multi-day harvest + approved P11/P12 before PATTERN_LAB_READY.

## Session B max-harvest updates (2026-10-07 ~14:00 UTC)
- RETENTION MAPPED (not ~30d for rounds): price service floor ~2026-09-07T09:48Z (~30d, 502 `chainlink_fetch_failed` below, 1s resolution + determinism verified); round floor ~2026-09-25T19:21Z (~11.6d, 404 below) → max ~16.7k labels. Docs: `research/history/PRICE_RETENTION.md`, `ROUND_API_MATRIX.md` (timeline max 41 rows, no cursor/history pagination; only single-round GET is historical; frontend `api.jup.ag/prediction/v1/play/*` observed-not-probed; wallet routes not probed per rule 4).
- HARVEST RUNNING: ~2370 venue rounds / ~2370 labels (DISCOVERY_ELIGIBLE, was 120), span 10-04→10-07 + growing; background `rounds` + `prices60` continue toward Sep-25 floor at 2.2s spacing (PIDs logged, checkpoint `research/history/checkpoint-max.json`, section-atomic after repair); 1s proof window 661/661 stored. 0× 429/403. Gaps (404s, incl. degraded 10-05/10-06 region + 01:28–01:30 corroborated ×2 harvesters) stay gaps.
- CONTEXT BUILT: `src/history_rich.mjs` + `historical_context_v1` (13 past-only snapshots T-60..T-1, 5/10/15/30m context, grid+exact coverage); scale report `research/history/SCALE_REPORT.md` with layered counts + gate block. On-chain spot-verified (program executable, 2 round accounts owned by program; `research/history/onchain/`).
- REMAINING: finish backfill to floor (~11 days ≈ 12k more round GETs ≈ 7h at 2.2s + prices); densify 1s beyond proof window (1M secs full-retention is infeasible — needs sampling strategy for Pattern Lab); row-level on-chain flags; DATASET-JUPITER-V2 builder merge (per SESSION_COORDINATION, no direct appends while collectors run).

## User-approved session updates (2026-10-07 ~15:30 UTC)
- CLEARED: P11 live smoke + 20-round prospective validation (directional only; no edge).
- CLEARED: P12A freeze (P12v1). P12B 100-round HELD for explicit confirm (~300 calls/~2h) — say go.
- OPEN: Jev/GLiDE per-call USD pricing (tokens stored for reconciliation).
- Foundry collecting: live capture 360min + 4 backfill passes; candles params unknown (stopped after 3 bounded tries); trades WS aggregate-only by design (PII redacted).
