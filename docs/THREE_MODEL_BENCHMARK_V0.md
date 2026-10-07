# THREE-MODEL BENCHMARK V0 — Jupiter-native, clean-room research contract

**As of:** 2026-10-07. **Status:** Research design, not a running trading system. **Market:** Jupiter Arcade BTC next 60-second round. **Data:** only Jupiter-facing market feeds, read-only REST and official settled outcomes. **Models:** OpenAI Decisions, TypeSafe Jev, Fastino GLiDE. **Mode:** paper only.

## 1. Official contracts (verified by reading provider documentation)

| Arm | Route | Auth | Input | Primitive | Normalized probability |
|---|---|---|---|---|---|
| `openai_decisions` | `POST https://api.openai.com/v1/decisions` | `Authorization: Bearer $OPENAI_API_KEY` | `input` string + `questions` array | `predicate`, name `next_btc_arcade_up` | `answers[].probability` |
| `typesafe_jev` | `POST https://api.typesafe.ai/v1/systemone` | `Authorization: Bearer $TYPESAFE_API_KEY` | `state` object + named `questions` map | `noul`, name `next_btc_arcade_up` | `answers.next_btc_arcade_up.noul` |
| `fastino_glide` | `POST https://api.fastino.ai/v1/systemone` | `X-API-Key: $FASTINO_API_KEY` | `state` object + named `questions` map | `noul`, name `next_btc_arcade_up` | `answers.next_btc_arcade_up.noul` |

OpenAI model `gpt-6-luna`; Jev documented alias `jev-latest` (resolve and pin the actual model/version per run); Fastino GLiDE model `fastino/GLiDE` (reply can say `glide`). GLiDE has a maximum 40k-token rendered question, different warmup/429/retry behavior and different response shape from OpenAI. Do not use Fastino `/v1/chat/completions` for GLiDE. GLiDE currently accepts both bearer and X-API-Key according to its docs; prefer the documented X-API-Key example. TypeSafe uses Bearer. These are **not** drop-in identical adapters.

Official sources:
- OpenAI guide: https://developers.openai.com/api/docs/guides/decisions
- OpenAI endpoint: https://developers.openai.com/api/reference/resources/decisions/methods/create
- TypeSafe API: https://docs.typesafe.ai/api
- Fastino GLiDE API: https://docs.fastino.ai/inference/systemone
- Fastino docs inventory: https://docs.fastino.ai/llms.txt
- Fastino product announcement and benchmark (vendor-reported, not evidence of crypto edge): https://fastino.ai/blog/introducing-glide-the-first-thinking-decision-model

## 2. One canonical task, not three different predictions

Frozen question semantics: **Given only Jupiter-origin information received by UTC time `as_of_ms`, estimate the probability that the UPCOMING BTC Arcade 60-second round will officially settle UP: its future closing boundary price strictly exceeds its future opening boundary price. Do not predict the currently active round. Do not use the future open, close, settlement, or price updates received after `as_of_ms`.**

Canonical feature JSON: `{experiment_id, round_id, target_start_ms, as_of_ms, expected_lock_ms_and_provenance, symbol, features: {returns_bps_1_5_15_30_60, volatility_bps_60, momentum_change, reversal_count_60, price_age_ms, gap_max_ms, price_observation_count_60}, pool_state_if_observed, missing_flags, provenance}`. All optional values null if unavailable. Do not pass untrusted predictive narratives. Use the *same* feature keys, numeric units, precision, and description for every provider; OpenAI accepts a stable serialized string representation and System One accepts an object. Pin this canonical serializer/hash.

- Run all three from the **same frozen snapshot** at e.g. next-round `T-10s`. It is not a forecast of the current live round.
- Parallel dispatch, independent request deadlines, same strict pre-lock deadline budget and same monotonic local timing.
- One core binary probability question per provider for the main experiment; supplemental regime/veto/score prompts are a separately registered arm.
- Never reveal another provider's result, historical label, or future trace to any provider.
- Refusal, empty answer, NaN, `p < 0`, `p > 1`, timeout, 425 warmup, HTTP errors, or past-lock response => abstain/ineligible, record failure class, do not backfill after settlement.

## 3. Minimal request/response examples (illustrative snapshot, not live BTC data)

**OpenAI**
```json
{"model":"gpt-6-luna","input":"Canonical Jupiter BTC snapshot JSON serialized at as_of_ms=...; task=upcoming round close > future open; illustrative not live.","questions":[{"type":"predicate","name":"next_btc_arcade_up","instructions":"Estimate whether the UPCOMING one-minute BTC Arcade round officially settles UP (future close > future open). Use only input evidence available at as_of_ms; do not infer the unknown opening price."}]}
```
Answer: `answers.find(a => a.name === 'next_btc_arcade_up' && a.type === 'predicate').probability`; treat `refusal` as a no-signal result.

**Jev**
```json
{"model":"jev-latest","state":{"as_of_ms":0,"market":"BTC","snapshot":"<same canonical Jupiter JSON>"},"questions":{"next_btc_arcade_up":{"type":"noul","instructions":"Estimate whether the UPCOMING one-minute BTC Arcade round officially settles UP (future close > future open). Use only input evidence available at as_of_ms; do not infer the unknown opening price."}}}
```
Answer: `answers.next_btc_arcade_up.noul`. Pin `jev` resolved model information, not only the moving `jev-latest` alias.

**GLiDE**
```json
{"model":"fastino/GLiDE","state":{"as_of_ms":0,"market":"BTC","snapshot":"<same canonical Jupiter JSON>"},"questions":{"next_btc_arcade_up":{"type":"noul","instructions":"Estimate whether the UPCOMING one-minute BTC Arcade round officially settles UP (future close > future open). Use only input evidence available at as_of_ms; do not infer the unknown opening price."}}}
```
Answer: `answers.next_btc_arcade_up.noul`. For model response, `confidence = |2*noul - 1|` is directional decisiveness, **not** demonstrated prediction accuracy. Verify headers, response schemas and warmup timing with fresh fixtures.

## 4. Same paper execution policy for independent arms

- At most **one virtual entry per arm per round**. Same 10 USDC nominal stake (no wallet), same eligibility deadline, freshness limits, and market-outage SKIP. Potential prices/odds must be timestamped and observed before lock.
- First freeze a simple common threshold, e.g. `p >= 0.57` => UP, `p <= 0.43` => DOWN, otherwise SKIP. Treat raw model probabilities as *scores*; optimize thresholds only on a predeclared separate training/validation split, never using held-out prospective test labels. Optionally also report threshold-free probability metrics.
- If missing eligible price/round event => all arm snapshots invalid. If provider late or fails => only that arm ineligible. No replacement signal from a different model. No ensemble in V0.
- If pre-lock pool quote/fee/settlement payout is not reliably measurable => paper direction performance only; do NOT calculate imaginary net profit.
- A post-lock model answer is logged for latency analysis, but must never count as an executable paper bet.

## 5. Benchmarks, controls and reporting

**Controls:** base-rate predictor, constant 50%, transparent Jupiter-price-only logistic model or EWMA momentum rule, each trained on past-only folds.

**Record per (round, arm):** `snapshot_sha256, received_as_of_ms, request_sent_ms, response_received_ms, model_id, prompt_sha256, raw_response_pointer, status, p_up_raw, p_up_calibrated_if_frozen, eligible_at_lock, paper_action, virtual_stake, payout_snapshot, settlement_truth, estimated_provider_cost, latency_ms, error_category`. Preserve both full population and matched common eligible population.

**Primary metrics:** paired Brier score and log loss versus controls over **same correctly labelled rounds**, with calendar-block uncertainty; pairwise differences; coverage; abstain rates; calibration by bucket; UP/DOWN accuracy with attempted counts; latency p50/p90/p99; missed-lock rate; API dollars per 1,000 valid predictions; and real-pool-quote-based virtual PnL/maximum drawdown only when provable. Do not choose the winner from win rate alone or use confidence margin as a calibrated price-movement probability.

**Gates:** (G0) documented/Jupiter schema fixtures, (G1) zero lookahead and replay parity, (G2) 100 consecutive observed rounds for operational reliability, (G3) freeze prompt and policy, (G4) 2,000+ *additional* prospective rounds across varied market days, (G5) publish paired results and whether any model beats a simple numeric price-only baseline. Sample size is a research target, not a promise of statistically significant edge.

**Pattern Lab after benchmark freeze:** freeze regime vocabulary and 1,000-scenario generator from historical Jupiter data; evaluate numeric-pattern-only, pattern+OpenAI, pattern+Jev, pattern+GLiDE as separately pre-registered arms. Never search 1,000 rules and report the maximum backtest performance as a live forecast. Historic Jupiter timestamped prices are backfill observations, not proof those values were already delivered to a live strategy at the timestamp.

## 6. Cost and practical operations

Three provider APIs = three independent billing accounts and rate limits. Only official OpenAI Decisions pricing is in the core V0 plan; fetch current TypeSafe and Fastino pricing/available trial credits directly before deployment instead of assuming free tiers. Add per-provider spending caps, request concurrency caps, bounded retries that cannot cross the pre-lock deadline, and explicit cold-model/warmup failure states. Store secrets only in backend environment variables, never logs, frontend, or git. Under repeated failure pause that arm without affecting other models or Jupiter capture.

**GLiDE note:** Fastino's product announcement reports a better *general* Decision Index score than Jev, but that does not establish a profitable edge or a latency advantage in Arcade. Test empirically.
