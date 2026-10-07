# Provider contract matrix — verified 2026-10-07 from official docs (no live calls)

| Field | OpenAI Decisions | TypeSafe Jev | Fastino GLiDE |
|---|---|---|---|
| Endpoint | `POST https://api.openai.com/v1/decisions` | `POST https://api.typesafe.ai/v1/systemone` | `POST https://api.fastino.ai/v1/systemone` |
| Model (pinned) | `gpt-6-luna` (only model available) | `jev-latest` (echoes e.g. `jev-1.13.0`) | `fastino/GLiDE` (echoes `glide`) |
| Auth | `Authorization: Bearer $OPENAI_API_KEY` | `Authorization: Bearer $TYPESAFE_API_KEY` | `X-API-Key: $FASTINO_API_KEY` (Bearer also accepted) |
| Request | `{model, input: string(JSON snapshot), questions:[{type:'predicate',name:'next_btc_arcade_up',instructions}]}` | `{model, state: snapshotObj, questions:{next_btc_arcade_up:{type:'noul',instructions}}}` | Same System One shape as Jev |
| Probability semantic | `answers[].probability` = P(predicate true) ∈ [0,1] | `answers[name].noul` = P(yes) 0(no)..1(yes) | `answers[name].noul` = P(true); `confidence=\|2·noul−1\|` separate axis |
| Normalization | identity (`raw==normalized`, uncalibrated) | identity | identity |
| Refusal | `{type:'refusal'}` → SKIP/MALFORMED | missing/non-noul → SKIP/MALFORMED | same |
| 401/402/403/404 | → AUTH_ERROR, no retry | 401 → AUTH_ERROR | 401/402/403/404 → AUTH_ERROR, no retry |
| 429 (+TypeSafe 529; Fastino 425/503) | → RATE_LIMITED (bounded backoff; zero retries past venue lock) | 429/529 → RATE_LIMITED | 425 warming (~60s), 429 (Retry-After), 503 → RATE_LIMITED |
| 422 | → MALFORMED, no retry | 422 validation → MALFORMED | 422 (incl. missing model/extra fields) → MALFORMED |
| Timeout | 4.5s req cap + venue-lock deadline → TIMEOUT then LATE→SKIP (docs suggest ≥300s for cold models; we deliberately prefer SKIP over late inference) | same | same |
| Cost metadata | $0.10/1M input tokens, no output charge | `usage:{input_tokens,output_tokens}` | `usage:{input_tokens,output_tokens}` + `token_usage`; pricing via model catalog |
| Evidence | `research/providers/openai/request-shape.json`, docs `developers.openai.com/api/docs/guides/decisions` (2026-10-07, unchanged) | `research/providers/jev/request-shape.json`, docs `docs.typesafe.ai/introduction/quickstart` + `/api` (2026-10-07) | `research/providers/glide/request-shape.json`, docs `docs.fastino.ai/llms.txt`, `/concepts/decision-models`, `/inference/systemone` (2026-10-07) |
| Live/auth tested here? | No (0 calls, APPROVE absent) | No | No |

Status mapping (`normalizeProviderResult` in `src/models.mjs`): OK→VALID; LATE/MISSED_LOCK→LATE; DISABLED_*→UNAVAILABLE; ERROR 401/402/403/404→AUTH_ERROR; 425/429/503/529→RATE_LIMITED; timeout/abort→TIMEOUT; BAD_PROBABILITY/refusal/422→MALFORMED; else UNAVAILABLE.
