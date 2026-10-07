# P11 live report — 20 prospective BTC rounds, 2026-10-07 ~08:29 UTC

Gate: **P11=PASS_DIRECTIONAL_ONLY** (complete causal loop proven; no edge found, none claimed).

## Run

- `scripts/paper-smoke-live.mjs` with `APPROVE_LIVE_SPEND=1`, caps 75 total / 25 per arm (used 63: 21 rounds × 3 arms; 20 valid + 1 pending-at-stop correctly excluded).
- 20 valid settled rounds (`btc-1791360540`…`1791361680`), venue 11 UP / 9 DOWN. Same frozen snapshot hash across arms every round (0 multi-hash rounds); 0 requests sent before snapshot; all responses before round end; usage stored (63 rows).
- Evidence: `data/reports/p11-20-rounds.json`, `p11-provider-comparison.csv`, live DB `var/p11-live`.

## Per-provider (eligible 20 each, 0 late, 0 errors)

| Arm | Acted | UP/DOWN | Wins/Losses | Acc | Brier | lat p50/p90/p99 |
|---|---|---|---|---|---|---|
| OpenAI (`gpt-6-luna`) | 0 (SKIP 20) | 0/0 | — | — | 0.251 | 694/1305/3856 ms |
| Jev (`jev-1.13.0`) | 0 (SKIP 20) | 0/0 | — | — | 0.257 | 581/874/1058 ms |
| GLiDE (`glide`) | 16 | 15/1 | 8/8 | 0.50 | 0.317 | 2851/3546/3623 ms |

- OpenAI pUp ∈ [0.48,0.50], Jev ∈ [0.46,0.51]: both models output near-maximum uncertainty on every round → systematic abstention under .57/.43. Parsers validated; this is model behavior, not a bug.
- GLiDE bullish (mean p 0.66, UP on 94% vs base rate 55%), 8/8; Brier 0.317 worse than constant-0.5 (0.25).
- Baselines: alwaysUP 11/20 (0.55), alwaysDOWN 9/20, prevCont 10/19, prevRev 9/19. Nothing beats alwaysUP; n=20, no significance claimed.
- Agreement: OpenAI==Jev all 20 (SKIP/SKIP); GLiDE differs on 16 (15 UP vs SKIP, 1 DOWN vs SKIP).

## Spend

66 inference calls total (P11B 3 + P11C 63). Tokens: OpenAI 9,901 in (~$0.001 at $0.10/1M) + P11C usage pending sum; Jev 15,660 in/525 out; GLiDE 22,385 in/3,663 out (USD unknown — provider pricing unconfirmed). PnL NULL (payout unverified).

## P11B single-round loop (closed)

Round `btc-1791360420` settled DOWN; OpenAI/Jev SKIP (null), GLiDE UP (incorrect). Evidence `research/providers/smoke.json` (+settlement).
