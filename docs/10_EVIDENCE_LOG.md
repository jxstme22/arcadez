# Evidence register / uncertainty (2026-10-07)

## Independently checked public docs for this package

- OpenAI Decisions: `https://developers.openai.com/api/docs/guides/decisions`, `https://developers.openai.com/api/reference/resources/decisions/methods/create` — `POST /v1/decisions`, model `gpt-6-luna`, predicate answer numeric probability. Model-specific API billing applies.
- TypeSafe: `https://docs.typesafe.ai/introduction/quickstart` — `POST https://api.typesafe.ai/v1/systemone`, bearer auth, `noul` response, `jev-latest`.
- Fastino: `https://docs.fastino.ai/llms.txt` and `https://agent.fastino.ai` — `POST https://api.fastino.ai/v1/systemone` GLiDE; current docs index points to OpenAPI. Fastino's agent docs mention X-API-Key. Exact account eligibility and live response not tested without credentials.
- GSD: `https://github.com/gsd-build/get-shit-done/blob/main/docs/ARCHITECTURE.md` and newer maintained forks — GSD supplies stage workflows and supports OpenCode install, but specific commands depend on installed version.
- OpenCode CLI: `https://opencode.ai/v2/docs/cli` — `opencode run "..."` can execute one noninteractive prompt session.

## Earlier owner-provided investigation; hypothesis transfer only

- R7 manifest: 3,057 historical captured BTC rounds; 2,323 venue-clean labeled rounds on required horizons. Older implementation and data not imported into new project. Prior stale feed runs prove need for receipt timestamps.
- R7 settlement verification: Jupiter-facing time-price service matched 2,323 labeled round directions; exact micro / Chainlink decoding found via chain settlement. Not an automated entitlement or infinite historical retention.
- R7-SV2: ~26,492 theoretical historical minute slots in a supported regime, but not 26,492 individually verified round-label pairs. No phantom rounds created.
- Earlier P06 reportedly discovered 78-path `/openapi.json` including `/play` routes. New repo must download and validate it; **remote OpenAPI retrieval failed from this environment**.

## Not verified in the packaging environment

1. Live `/api/v1/play/rounds` method and JSON schema (candidate only); final trading/lock field names.
2. Live price WS subscription wire shape, ticker nested values, heartbeat, actual latency/availability.
3. GLiDE, Jev and OpenAI authenticated inference with real keys; per-account access, billing, limits, response times.
4. Pre-lock actual pool odds vs settled payouts and exact fee treatment; paper PnL stays NULL.
5. Continuous/overnight service process, actual operator computer permissions, production deployment.

No user credentials were available or used. This package's 25 offline unit tests are real. Any additional live results must come from local agent reports with attached evidence.
