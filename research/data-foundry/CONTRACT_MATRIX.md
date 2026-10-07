# Contract matrix — revalidated 2026-10-07 ~13:15 UTC (bounded GETs, 2.1s spacing)

| Endpoint | Status | Schema / notes |
|---|---|---|
| `GET /openapi.json` | UNCHANGED | 207182 bytes (identical size to prior session); `roundsInSchema=true` stands |
| `GET /api/v1/play/config` | UNCHANGED | 399 bytes; 60s rounds, cutoff 5s, feeBps 100, assets BTC/SOL |
| `GET /api/v1/play/rounds/current` | UNCHANGED | `{serverTime, live[], bettable[]}` |
| `GET /api/v1/play/rounds?asset=&before=&after=` | UNCHANGED | `{data[], serverTime}`; `asset` required (400 without) |
| `GET /api/v1/play/rounds/{asset}/{openTs}` | UNCHANGED | single PlayRound; minute-grid-aligned ts required (off-grid → 4xx) |
| `GET /price/crypto/{sym}?timestamp={sec}` | UNCHANGED | `{symbol,timestamp(ms),value}`; echo-validated |
| `GET /price/crypto/{sym}/candles` | PARAMS_UNKNOWN | 400 for default, `?interval=1m&limit=5`, `?resolution=60&from=&to=`; no further guessing (no hammering) |
| `wss://…/ws/crypto` | VERIFIED (prior) | subscribe `{type, symbols:[btcusdt]}`; snapshot + ~1Hz ticks |
| `wss://…/ws/play/trades` | NEW VERIFIED | **no subscribe needed**; snapshot `{type,trades[20]}` + live `{type:trade, id, asset BTC\|SOL, roundAddress, owner, side, amount(micro), timestamp(sec), signature}`; owner/signature are bettor-PII → aggregate-only, redacted at ingest |
| `wss://…/ws/orderbook`, `/ws/prices`, `/ws/bisonfi` | KNOWN_UNUSED | exist in bundle routes; not needed for Arcade 1m |
| `POST /play/bets|claims/prepare` | FORBIDDEN | exist in bundle service; allowlist-blocked, never called |

Raw bundles: `research/ws/raw/OneMinuteHistory-B9-EhmsN.js` (Play service def), prior vendor/arcade chunks.
Sensitive-field policy: trade `owner`/`signature`/`roundAddress` never persisted raw (see H05 note in DATA_FOUNDRY_REPORT).
