# Three-model benchmark and inference API contracts

**Same task for all**: Given *Jupiter-native* evidence available before a specified `as_of_ms`, estimate whether the **upcoming** BTC Arcade 60-second round's closing price will be greater than its unknown opening price. This is NOT the live current round. A single frozen market snapshot is serialized and hashed before concurrent dispatch.

| Arm | HTTP method / route | Key env | Request | Expected scalar |
|---|---|---|---|---|
| OpenAI | POST `https://api.openai.com/v1/decisions` | `OPENAI_API_KEY` | `{model:'gpt-6-luna',input: JSON_STRING,questions:[{type:'predicate',name:'next_btc_arcade_up',instructions:...}]}` | `answers[].probability` |
| TypeSafe | POST `https://api.typesafe.ai/v1/systemone` | `TYPESAFE_API_KEY` | `{model:'jev-latest',state: SNAPSHOT,questions:{next_btc_arcade_up:{type:'noul',instructions:...}}}` | `answers.next_btc_arcade_up.noul` |
| Fastino | POST `https://api.fastino.ai/v1/systemone` | `FASTINO_API_KEY` | `{model:'fastino/GLiDE',state: SNAPSHOT,questions:{next_btc_arcade_up:{type:'noul',instructions:...}}}` | `answers.next_btc_arcade_up.noul` |

OpenAI and Jev documented Bearer auth. Fastino documentation favors `X-API-Key` for its server. Verified docs: `https://developers.openai.com/api/reference/resources/decisions/methods/create`, `https://docs.typesafe.ai/introduction/quickstart`, `https://docs.fastino.ai/llms.txt`. Exact Fastino OpenAPI and production response must be rechecked when network available. No fake successful request without keys.

## Strict failure treatment

- Invalid/missing/refusal/no `noul` or `predicate`, NaN, number outside `[0,1]`, HTTP failure, timeout, pre-lock deadline miss -> SKIP; log category.
- Missing provider credentials -> `DISABLED_MISSING_KEY`, others unaffected.
- Global `MAX_MODEL_CALLS_PER_SESSION` and arm cap enforce software request limits; provider dashboard billing caps are additionally required.
- Do not mix provider response probabilities, use a majority vote, or pick the better-looking posterior in V0. No calibration until chronological data exist. Output 0.70 is **a model score**, not proven hit probability.

## Frozen action policy, initial hypothesis only

`p_up >=0.57 => PAPER_UP`, `p_up <=0.43 => PAPER_DOWN`, otherwise SKIP. Same stake 10 hypothetical USDC, same lock conditions, same data quality gate. No PnL until observed pre-lock payout mechanics. Stability of thresholds must be proved on held-out future rounds; no per-provider tuning using the same future outcomes.

## Agent adapter verification

- Assert HTTP paths + auth header names with fake HTTP transport (do not log header values).
- Assert typed schema and response refusal/error handling for all three.
- Verify request/response timestamp and deadlines under timeouts; compare only matched eligible rounds.
- Warmup/cold model delays and retry rules may differ; zero retries over lock, no blocking another arm on one failure.
- Keep exact model alias and returned version string, prompt hash and input hash; detect silent model changes and start a new evaluation cohort.
