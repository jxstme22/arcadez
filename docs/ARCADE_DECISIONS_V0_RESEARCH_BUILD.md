# ARCADE DECISIONS V0 — Jupiter-native, clean-room three-model benchmark

**Research cut:** 2026-10-07 (Asia/Jakarta)  
**Status:** Research/specification completed; **not** deployed or live-tested in this deliverable; benchmark update 2026-10-07.  
**Scope:** BTC only; Jupiter-origin market information only; clean new repository; independent OpenAI Decisions, TypeSafe Jev, Fastino GLiDE benchmark arms; read-only/virtual positions; no transaction submission.  
**Separate subsequent track:** `ARCADE_PATTERN_LAB_V1.md`.

## Executive finding

A Jupiter-only, three-model paper-trading V0 is technically plausible. A high-fidelity backtest from historical prices is **not** the same as a causal historical replay; past price data do not prove when a price was first available to a live strategy. The strongest immediate experiment is to collect live Jupiter observations, fan out the identical frozen market snapshot to OpenAI Decisions, TypeSafe Jev, and Fastino GLiDE on a controlled schedule, and compare independent frozen predictions with later venue settlement. No evidence yet demonstrates an economic edge.

**Success criteria, in order:** (1) schema and timing verified, (2) zero lookahead, (3) frozen prospective predictions and settled labels, (4) calibration better than baselines, (5) payout-aware paper PnL with timestamped odds. Never optimize against a contaminated test set.

## 1. Sources and evidence matrix

| Source / claim | Status / caution | Role |
|---|---|---|
| OpenAI Decisions: `POST https://api.openai.com/v1/decisions`, model `gpt-6-luna`, `predicate` / `choice` / `score`, `answers`, `usage` | **Documented**, public beta announced 2026-10-06; `$0.10 / 1M input tokens` for Decisions with no output-token fee; API account billing/limits apply | Inference |
| Official Jupiter Prediction API / Forecast | **Documented**; Forecast is a separate 15-minute product, not Arcade's one-minute game | Avoid wrong endpoint family |
| Jupiter Arcade REST `https://prediction-market-api.jup.ag/api/v1/play/*` | **Previously observed in Jupiter's own frontend and earlier P06 research**, not confirmed via live OpenAPI fetch in this research session | Round schedule, odds, results; inspect exact paths before coding |
| Arcade OpenAPI `https://prediction-market-api.jup.ag/openapi.json` | Earlier P06 reported a ~190KB, 78-path schema, but live retrieval failed in this session | First live discovery gate |
| Jupiter price-service WS `wss://prediction-market-price-service.fly.dev/ws/crypto` | **Previously observed first-party frontend route**; wire protocol/schema must be rediscovered and logged | Live price |
| Jupiter `/ws/play/trades` | **Previously observed first-party frontend route**; Arcade bettor activity, **not** BTC exchange order flow | Pool activity if viable |
| Jupiter `/price/crypto/btcusdt?timestamp=<unix_seconds>` | Prior R7-SV found same-second price matches to all 2,323 clean recorded round directions. 30-day-ish historical floor was measured in September; re-probe before assuming the same today | Historical price and settlement corroboration, not necessarily live predictor |
| Jupiter `/price/crypto/btcusdt/candles` | Observed from frontend bundles; timeframes, max window, fields unknown until probed | Efficient historical price collection if available |
| Jupiter's general `/price/v3` | Not proven equivalent to Arcade's BTC settlement price | Do not use as target or mix with settlement feed |

**Primary sources (public)**
- https://developers.openai.com/api/docs/guides/decisions
- https://developers.openai.com/api/reference/resources/decisions/methods/create
- https://community.openai.com/t/decisions-api-is-now-available-in-public-beta/1403877
- https://developers.jup.ag/docs/prediction
- https://developers.jup.ag/docs/prediction/forecast

**Prior owned research (not recreated or modified here)**
- `SV-REPORT.md`, 2026-09-29: Jupiter price service vs venue direction reproduction, price source and Chainlink verification.
- `R7-DATASET-MANIFEST.md`, 2026-09-29: 2,323 clean labelled rounds; live source-freshness constraints; 3,057 total captured rounds.
- `R7-SV2-REPORT.md`: theoretical ~26,492 historic round slots under a settlement regime but incomplete individual existence/verification evidence. **Not** an already validated 26,492-label training set.
- Prior P06 discovery: `/openapi.json` identified previously missed `/play` endpoints. Actual schemas must be rediscovered.

## 2. Non-negotiable target and market timing

For target upcoming round `N`, define its exact start/settlement boundary `A_N` and closing boundary `B_N` from Jupiter's authoritative round record. The outcome is:

```
UP     if B_N > A_N
DOWN   if B_N < A_N
VOID   if B_N == A_N or the venue marks void/refund under documented rules
```

The **next round's opening price is not known in advance**. At the pre-lock decision time `A_N - 10 s`, the task is to predict the direction from the future open to the end of the future 60-second round — **not** merely whether current BTC price rises over the next ten seconds or whether the still-live previous round wins.

At V0, seek an eligible decision at `T-10s` (candidate schedule); test `T-15s`, `T-7s`, `T-5s` as **shadow snapshots**, not extra trades. Use actual venue lock timestamps if available. Treat `T-3s` as a historical rule of thumb pending live verification; never infer tradability solely from a countdown UI. Persist `request_sent_at_ms`, `response_received_at_ms`, `round_id`, `round_open_at_ms`, `lock_at_ms` (observed/derived provenance), and `paper_eligible`.

## 3. Discover API schema before implementation

1. Download `GET /openapi.json`, store full JSON + SHA-256 + retrieval timestamp; enumerate `paths` containing `/play`. Use `servers`, descriptions and schemas to find **read-only**: config, round listings, status, rounds/settlement, pools/odds, price; verify exact query parameters and expected field types.
2. Probe only documented/discovered GET routes with a bounded request rate, no auth circumvention, no writes; capture full request/response fixture with headers/status and timing.
3. Replay frontend WebSocket subscription protocol; log raw received messages and timestamp fields; do not synthesize message shapes. Validate reconnect and heartbeat.
4. Inspect candle endpoints; establish available ranges, symbol spellings, alignment and whether minute candles correspond to the exact underlying price series. Prefer candle/bulk routes over millions of per-second HTTP calls.
5. Verify pooling/payout semantics through observed round snapshots and final settle records; do not assume a current displayed multiplier is the payout after lock.
6. Record endpoint-specific retention, rate limits, 429 behavior, CORS, failures, symbol support and terms/permissions. Save fixture tests. If essential sources cannot be verified, **fail closed** and keep V0 data-collection-only.

**Important:** Our present research check could not retrieve the live OpenAPI JSON; do not paste invented `/play` subpaths into production code.

## 4. V0 collector and data model

Logical modules:

```
src/
  jupiter/openapi-audit.ts       # schema inventory and fixture checks
  jupiter/arcade-rest.ts        # read-only round/settlement/odds adaptor
  jupiter/price-ws.ts          # WebSocket consumer, reconnect
  jupiter/price-history.ts     # optional bounded history, NEVER used as live event
  features/causal-snapshot.ts  # strictly as-of calculations
  models/openai-decisions.ts   # POST /v1/decisions
  models/typesafe-jev.ts      # POST TypeSafe /v1/systemone
  models/fastino-glide.ts     # POST Fastino /v1/systemone
  models/normalize.ts         # common probability, status, cost and latency contract
  benchmark/fanout.ts         # concurrent independent model requests
  paper/decision-gate.ts       # lateness, data quality, thresholds, EV
  paper/ledger.ts              # append-only virtual positions
  eval/prospective.ts          # calibration + outcomes
  ops/replay-fixtures.ts       # deterministic fixture tests
```

Prefer one SQLite database + immutable raw JSONL files initially. Exact schema can be adapted to existing project tables.

**Core observations**:

- `raw_event(event_id, source, event_type, source_ts_ms, received_at_ms, monotonic_arrival_ns, raw_json, raw_sha256, connection_id)`
- `round(round_id, asset, start_ms, end_ms, lock_ms, open_micro, close_micro, status, settle_seen_ms, provenance)`
- `pool_snapshot(round_id, observed_at_ms, received_at_ms, up_stake_micro, down_stake_micro, displayed_odds, raw_json)`
- `decision(round_id, decision_at_ms, as_of_received_ms, features_json, feature_hash, model, prompt_version, api_latency_ms, raw_answer, p_up_raw, p_up_calibrated, eligible, skip_reason)`
- `paper_ledger(round_id, side, paper_stake, assumed_multiplier, assumption_type, eligibility, result, hypothetical_pnl, observation_status)`
- `data_gap(source, gap_start, gap_end, reason)`

Store exact financial numerics as integer micro-units or decimal strings (not binary floating point) and keep the venue's raw response.

### Information-causality rule

For snapshot at decision timestamp `t`, a source datum is usable iff:

```
received_at_ms <= t
AND source_ts_ms <= t  (when source event time is meaningful)
AND t - received_at_ms <= max_allowed_receive_age_ms
AND stream coverage and clock checks pass
```

No backfilled value counts as a live observation, even if its `source_ts_ms` predates `t`. Historical price queries are **research/backfill** data with a distinct provenance. Correctly handle clock offsets and ensure the machine clock is synchronized. Keep both market (event) time and arrival time.

The prior R7 dataset found that 23% of its horizon snapshots had very stale venue values (>60s). This is not hypothetical; failing to gate this is capable of fabricating apparent edge. Start with conservative 2–3s live feed age thresholds and measure the actual stream gap distribution before freezing them.

## 5. Jupiter-only features (versioned)

**Mandatory (only with verified live feed):**
- `return_5s_bps`, `return_15s_bps`, `return_30s_bps`, `return_60s_bps`, `return_180s_bps`, `return_300s_bps`
- `realized_vol_30s_bps`, `realized_vol_60s_bps`, `range_60s_bps`
- `momentum_delta_5v30`, `acceleration_15v60`, `flip_count_60s`, `drawdown_60s_bps`
- `price_observation_count_60s`, `last_feed_age_ms`, `max_gap_ms`, `clock_skew_flag`
- Exact next round ID, seconds-to-lock and **availability of round state**.

**Optional if truly present in the Jupiter streams:**
- Pool imbalance, changes in bet concentration, stake flow per second, displayed multiplier per side, liquidity/one-sided-risk flags.
- Do **not** name bettor flow `aggressive_buy_volume_btc` or treat it as BTC CEX trade volume. Without Jupiter-provided BTC exchange orderbook/tape fields, order flow, funding, orderbook spread, liquidation, and taker imbalance are **unavailable**.

Create two feature views: `PRICE_ONLY_V0` (primary, reproducible) and `PRICE_PLUS_POOL_V0` (ablation). Pool activity may be highly endogenous and vulnerable to late changes; comparing them separately matters.

## 6. Three independent decision models (benchmark protocol)

`POST https://api.openai.com/v1/decisions`; the request sample below uses the **verified response contract**. Jev and GLiDE use independent adapters and must receive the same facts, task semantics, and as-of timestamp, with equivalent but provider-specific request schemas. The model cannot retrieve the price feed; send fully serialized, time-bounded evidence in `input`. Start with one `predicate` for up probability and one independent `choice` for pattern/regime classification if regime vocabulary is already frozen. Do not dynamically invent class IDs every minute.

```json
{
  "model": "gpt-6-luna",
  "input": "Round: btc-next; evidence_as_of_utc: 2026-10-07T03:00:50Z; market: BTC; decision_deadline_ms: ...; JUPITER_ONLY price 5s_ret_bps=0.7, 15s_ret_bps=1.3, 60s_ret_bps=-0.4, vol_60s_bps=2.1, last_price_age_ms=485. These are illustrative example inputs, not live readings.",
  "questions": [
    {
      "type": "predicate",
      "name": "upcoming_round_up",
      "instructions": "Estimate whether the NEXT Jupiter Arcade BTC round will settle UP (close strictly above its own future opening price), not the currently active round. Use only the evidence in input. This is a forecast, not a factual pattern-recognition task; avoid assuming past returns determine future direction."
    }
  ]
}
```

Example parse: `answers.find(a => a.name === 'upcoming_round_up' && a.type === 'predicate')?.probability`. Verify finite `0 <= p <= 1`, refusal handling and exact response model; otherwise SKIP. Persist original JSON and usage. **Model probability is an uncalibrated score** until measured on forward unseen settlements. The `choice` answer's `confidence` is **not** a validated probability of winning an Arcade bet.

OpenAI docs say independent questions may be grouped into one request, but dependent stages require separate requests. In V0 use one common binary target per model: OpenAI `predicate`, Jev `noul`, GLiDE `noul`; postpone pattern-ID classification until labels and taxonomy are frozen. See `THREE_MODEL_BENCHMARK_V0.md` for verified endpoints, request shapes, normalization, parity, and scoring.

### Spend control

OpenAI Decisions pricing, checked 2026-10-07: $0.10 per 1M input tokens with no output-token fee, subject to plan and pricing changes. At 1k tokens × 1440 candidate rounds per day, OpenAI input cost is theoretically ~$0.14/day, **if** one request per round and continuously available. Jev/GLiDE have separate provider billing, token accounting, and rate limits; get live quotes before forecasting combined spend. Log provider token usage, dollars, and hard daily/monthly caps. Count warming/429/timeouts as failed or late, never as a retrospective prediction.

## 7. Paper decision policy

Every upcoming round yields at most one eligible paper decision **per model**. The identical deterministic gate independently chooses `UP`, `DOWN`, or `SKIP` using a frozen policy. At V0, thresholds are research hypotheses, not optimized values. Example: trade UP when `p_up_raw >= 0.57`, DOWN when `p_up_raw <= 0.43`, otherwise SKIP; **only** if all freshness, lock, and payout requirements pass. The first phase should record forecasts even when all paper trades SKIP.

If no trustworthy pre-lock payout quote exists, record `PAYOUT_UNAVAILABLE` and **do not publish simulated economic profit**. Prediction accuracy can still be evaluated. If pre-lock odds are available, simulate an entry using a clearly labeled contemporaneous multiplier, check the final round rule and fee accounting, track floating multiplier uncertainty, and avoid pretending a post-settlement payout was knowable at the decision time.

Mark `LATE` if response arrives past paper lock. LATE is neither a bet nor a valid entry. VOID must be refunded per confirmed rules. No wallet, keypair, trade execution or signing capability in this track.

## 8. Evaluation and release gates

**Gate D0 — contract:** OpenAPI and at least one valid price/round/settlement response saved; schema tests pass.  
**Gate D1 — time:** verified arrival timestamps; drift bounded; no post-decision field in any snapshot; 100% fail-closed on stale input.  
**Gate D2 — paper readiness:** 100 consecutive rounds monitored, unique round IDs, independent responses for the three arms or explicit failures, missed/late cases accurately counted, raw-answers+results auditable. (Do not claim all 100 need a trade.)  
**Gate D3 — prospective research:** freeze prompts/adapter schemas and thresholds for all arms; 2,000+ valid distinct forward rounds, preferably spanning multiple dates and volatility conditions. Evaluate pairwise metrics only on matched, eligible rounds; additionally report full-intention-to-predict coverage. Don't tune on test segment.  
**Gate D4 — expand:** only after credible out-of-sample gains versus always-UP, always-DOWN, 50%, and deterministic price-only models; positive estimated payout-adjusted EV is a separate test.

**Required metrics**: paired model coverage; relative Brier/log-loss uplift over a no-AI logistic baseline; cost per valid forecast; `p50/p90/p99` API latency; stale/missing-rate; deadline-miss-rate; Brier score; log loss; calibration/reliability by bucket; UP/DOWN accuracy and count; SKIP rate; payoff-aware `virtual_pnl`, max drawdown and source of multiplier; per-day fold analysis; block-bootstrap uncertainty. Distinguish total decisions, evaluable decisions, and actually eligible paper entries.

## 9. Replay and future-proofing

- Input snapshots MUST be deterministic and saved before any outcome is available. Replay from raw arrival-ordered events and compare hashes to production-derived features.
- Keep prompts and model version pinned. Store an experiment registry with exact git commit, parameters, source schema digest and start timestamp.
- A historical backfill can be used to *develop* representations; use a different tag from a causally captured historical test set.
- Retention windows move. Re-probe as of start date; cache responsibly; honor rate limits and upstream permissions, never flood a one-second lookup route for 2.6M samples.
- Jupiter may change undocumented frontend endpoints without warning. Put them behind adapters and stop safely on breaking schemas.

## 10. Build-agent implementation prompt

> Build `arcade-decisions` as a **new repo from scratch**. Do not import old code, database, model outputs, environment files or migrations. Past reports are informational only. BTC and Jupiter-native market data only; read-only collector and virtual paper ledger; no wallet or transaction execution. Read `THREE_MODEL_BENCHMARK_V0.md` and `START_AGENT_PROMPT.md` first.
>
> P0: audit Jupiter current OpenAPI `/play` schema, price WebSocket, history limits, and exact round semantics; record reproducible fixtures. P1: append-only collector with receive timestamps, causal features, replay and tests. P2: implement three independent provider adapters, identical atomic next-round UP question, canonical normalized `p_up_raw`, and concurrent fan-out from an immutable snapshot. P3: independent paper trade per model under identical conservative gate; record all late, refusal, warming and unavailable outcomes. P4: prospective paired benchmark vs always-UP/base-rate and deterministic price-only controls. Pattern Lab is later, frozen and separately evaluated. No mixing model outputs, voting or tuning on prospective holdout.

## 11. Findings we must not misstate

- `POST /v1/decisions` outputs *estimates*, not an exchange-trained price model or guaranteed calibrated probability.
- Instantaneous settlement-price reproduction ≠ predictive advantage.
- An exact timestamp requested from the historical service ≠ proof that it was known to a real trader then.
- Reconstructing a round from price history requires evidence of round existence and identical source/settlement semantics; theoretical minute slots are not certified labels.
- A strong win rate can still lose money on parimutuel payouts.
- The V0 is a **research and paper system**, not a real-money bot.
