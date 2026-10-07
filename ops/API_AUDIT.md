# API audit — live overnight run, 2026-10-07 (UTC)

**Session:** single live local agent, OpenCode 1.18.35, Node v22.18.0. No paid model calls. Bounded Jupiter GETs only (2s+ spacing, no retries on 429 beyond stop).

## Jupiter Arcade (first-party, read-only)

| Endpoint | Method | Observed 2026-10-07 | Status |
|---|---|---|---|
| `GET https://prediction-market-api.jup.ag/openapi.json` | GET | `openapi 3.0.0`, 85 paths, full bytes 207182 SHA `1d19a16b…be87ce` stored in SQLite `arcade.openapi.full` | OBSERVED_LIVE |
| `GET /api/v1/play/config` | GET | `programId 2DeG…Pt`, `settlementMint EPjF…1v`, decimals 6, `assets [BTC,SOL]`, `roundDurationSeconds 60`, `betCutoffSeconds 5`, `clientDisableBufferSeconds 0`, `feeBps 100`, `paused false`, limits min `1000000` maxPerEntry `1000000000` micro USDC. Fixture `research/fixtures/jupiter.play.config.20261007.json` SHA `f9d29ab2…` | LIVE_PROBED |
| `GET /api/v1/play/rounds/current` | GET | `{serverTime, live:[PlayRound], bettable:[PlayRound]}`. Example live `btc-1791345720 openTs 1791345720 closeTs 1791345780 status live outcome UNRESOLVED upPool 51000000 downPool 41000000 openPrice 84162410047 closePrice null`. Fixture SHA `52c02e02…` | LIVE_PROBED |
| `GET /api/v1/play/rounds?asset=BTC&before=5&after=1` | GET | Requires `asset` (400 without). Returns `{data:[7 PlayRound], serverTime}`. 5 settled + live + future. Settled example `btc-1791345660 status settled outcome UP openPrice 84138141522 closePrice 84162410047 upPool 65420000 downPool 52000000 feeAmount 240871`. Fixture SHA `fa218562…` (time-varying) | LIVE_PROBED |
| `GET /api/v1/play/rounds/{asset}/{openTs}` e.g. `/BTC/1791345660` | GET | Single PlayRound, same schema. Verified 2026-10-07 | LIVE_PROBED |
| `GET https://prediction-market-price-service.fly.dev/price/crypto/btcusdt?timestamp={sec}` | GET | `{symbol btcusdt, timestamp ms, value float}` e.g. `{"symbol":"btcusdt","timestamp":1791345875000,"value":84187.36}`. Fixture `research/fixtures/jupiter.price.timestamp.20261007.json` | LIVE_PROBED |
| `wss://prediction-market-price-service.fly.dev/ws/crypto` | WS | TCP+OPEN ok (~1.7s), **0 frames in 12s with no subscribe**. `JUPITER_PRICE_WS_SUBSCRIBE_JSON` empty. No subscribe shape observed. Collector preserves raw frames and yields zero ticks until verified. | BLOCKED_WS_WIRE |
| Pool/payout | — | `upPool/downPool/feeAmount/remainingPayout` observed per round. Pre-lock quote timing, fee rounding, own-stake impact **not** verified. `paper.pnl_usdc` stays NULL. | BLOCKED_PNL |

PlayRound schema (from live OpenAPI `PlayRound`, required): `id e.g. btc-1753660800, address, asset BTC|SOL, openTs/closeTs unix-sec, claimDeadlineTs null-until-settled, status betting|locked|live|resolving|settled|voided, outcome UNRESOLVED|UP|DOWN|VOID, upPool/downPool/feeAmount/remainingPayout string micro USDC, openPrice/closePrice string 1e6-scaled nullable, openObservationTs/closeObservationTs nullable`. Prices exact micro strings, never float. Timestamp semantics: venue `openTs` seconds, `serverTime` seconds, local `received_ms` ms. Clock drift warned if |drift|>15s.

Rate limits observed: none hit (429 never seen in 8 bounded GETs, 2.1s spacing). Retry-after respected by stop-on-429 in harvest.

## Model inference (docs only, no auth calls this session)

| Arm | Contract (from official docs 2026-10-07) | Live/auth tested? |
|---|---|---|
| OpenAI Decisions `POST https://api.openai.com/v1/decisions` model `gpt-6-luna`, `questions:[{type:predicate,name:next_btc_arcade_up}]` → `answers[].probability`. Docs: developers.openai.com/api/docs/guides/decisions. Pricing $0.10/1M input tokens. | DOCUMENTED + OFFLINE_MOCK_TESTED |
| TypeSafe Jev `POST https://api.typesafe.ai/v1/systemone` Bearer, `model jev-latest`, `questions:{next_btc_arcade_up:{type:noul}}` → `answers…noul`. Docs: docs.typesafe.ai/introduction/quickstart. | DOCUMENTED + OFFLINE_MOCK_TESTED |
| Fastino GLiDE `POST https://api.fastino.ai/v1/systemone` `X-API-Key`, `model fastino/GLiDE`, same `noul` shape. Docs index: docs.fastino.ai/llms.txt. | DOCUMENTED + OFFLINE_MOCK_TESTED |

No `401/422/429/529` live responses observed (no calls made per spend cap + user instruction to assume no credentials). Fake-transport tests cover 401/429/timeout/malformed/late.

Unknowns: WS subscribe JSON, WS frame nesting/timestamp field, heartbeat, tick rate, candle retention/pagination, exact payout multiplier rounding, claim deadline enforcement. All labeled UNKNOWN in code, never guessed.

## P10 additions (2026-10-07 ~11:30 UTC, FRONTEND_OBSERVED + LIVE_PROBED)

- Crypto WS (from jup.ag production bundle + live probe): `wss://prediction-market-price-service.fly.dev/ws/crypto`, subscribe `{type:subscribe,symbols:[btcusdt]}`, unsubscribe `{type:unsubscribe_all}`. Price frames `{symbol,value,timestamp(ms)}` ~1Hz; snapshot \~120 ticks; control `snapshot|subscribed|unsubscribed|unsubscribed_all|error`. 10-min verification: 981 frames / 589 valid / 0 SOL / 1 reconnect recovered / iar p50 951ms. Full contract: research/ws/PROTOCOL.md, verification.json.
- REST price: `GET /price/crypto/{symbol}?timestamp={sec}` validates `timestamp===sec*1e3`; candles path `/price/crypto/{symbol}/candles` (params UNKNOWN).
- Payout (arcade bundle gn/vn + feeBps 100): gross total/winner (1.0 empty, null one-sided); net stake*gross*0.99. feeAmount field UNVERIFIED (~0.02-0.3% of total, not 1%). 20 settled fixtures all match price direction.

## Continuation additions (2026-10-07 ~12:30 UTC, docs + bounded GETs)
- Providers re-pinned (docs unchanged): OpenAI $0.10/1M in; TypeSafe errors 401/422/429/529; Fastino X-API-Key, retryable 425/429/503, terminal 401/402/403/404/422, model echo "glide". Matrix: research/providers/PROVIDER_MATRIX.md. 0 live calls.
- History harvest: 120 single-round GETs (0 miss after grid fix) + 120 price GETs, 2.1s spacing, no 429. Retention at least ~2.2h confirmed for rounds; older retention untested.

## Session B max-harvest additions (2026-10-07 ~14:00 UTC, ~5000 bounded GETs, 2.2s spacing, 0× 429/403)
- Retention (exponential + 8-step binary search, `research/history/price-retention.json`): price floor in `(1788769081, 1788774481]` (~2026-09-07T09:48Z, ~30d; below → deterministic 502 `chainlink_fetch_failed`); round floor in `(1790361720, 1790364060]` (~2026-09-25T19:21Z, ~11.6d; below → 404 `round_not_found`). Price 1s resolution verified (5 consecutive secs distinct values, requested==returned) + determinism (re-request identical). Prior ~30d round-retention assumption falsified.
- Round matrix (14 GETs, `research/history/round-matrix-raw.json`): timeline `before/after ∈ [0,20]` (max 41 rows, defaults 5/5, 400 without asset or over-max); undocumented `cursor` ignored (no pagination); single-round GET 200 settled/live/future(betting), 400 off-grid (must be ÷60), 404 below floor. No archive/history/timeline-pagination route in 85-path schema.
- Frontend (bundles `jup.ag/prediction/arcade`, 2026-10-07): `OneMinuteHistory` + `arcade-YTzcvXJt` construct `GET {PREDICTION_MARKET_API_URL ?? https://api.jup.ag}/prediction/v1/play/rounds|round|history/{wallet}|stats` (alternative base — observed, NOT probed, host not allowlisted); history rail = last-5 PAST from the same timeline query (`refetchInterval 5s`); `cryptoPrice({timestamp: closeTs})` polled only while `closePrice===null`; per-wallet `history(start/end/roundAddresses)` only; client `retry 3/2s`, 429 → Rate Limit Exceeded; new `wss://…/ws/play/trades` string observed (not connected).
- On-chain (6 read-only `getAccountInfo`, `research/history/onchain/`): program `2DeG…Pt` executable/BPFLoaderUpgradeable; 2 venue round accounts (oldest+newest) 139B, owner=program. No signing/keys/transactions.
