# Round API matrix — CURRENT OpenAPI re-inspection 2026-10-07 (85 paths)

Source schema: `GET https://prediction-market-api.jup.ag/openapi.json`
(`openapi 3.0.0`, cached in SQLite `arcade.openapi.full`; re-inspected live
2026-10-07 ~08:20Z via `research/history/round-matrix-raw.json`, 14 bounded
GETs, 2.1s spacing, 0× 429). Only documented read-only GET routes probed.
No POST/PUT/DELETE touched. Wallet routes NOT probed with real addresses.

## Read-only `/play` GET routes (7 in schema)

| # | Route | Doc description | Probed 2026-10-07 | Result |
|---|---|---|---|---|
| 1 | `GET /api/v1/play/config` | Play config | 200 | `programId 2DeG…Pt`, `roundDurationSeconds 60`, `betCutoffSeconds 5`, `feeBps 100`, assets `[BTC,SOL]`. No params. |
| 2 | `GET /api/v1/play/rounds/current` | Live + bettable | 200 | `{serverTime, live:[BTC+SOL], bettable:[BTC+SOL]}`. No params. `live` has `openPrice`, null `closePrice`; `bettable` all null prices/pools. |
| 3 | `GET /api/v1/play/rounds?asset=&before=&after=` | Bounded timeline around current | 200 (6 variants) | See param table. **No cursor/history/pagination.** `before,after ∈ [0,20]`, default 5/5. `asset` required. Unknown `cursor` param **ignored** (same 7 rows). |
| 4 | `GET /api/v1/play/rounds/{asset}/{openTs}` | Single round by asset+openTs | 200/400/404 | **The ONLY historical route.** `openTs` must be minute-aligned else 400. Settled → full prices/pools/outcome; future `betting` → null prices; below floor → 404 `round_not_found`. |
| 5 | `GET /api/v1/play/rounds/{asset}/{openTs}/positions/{walletAddress}` | Round position for wallet | NOT probed | Per-wallet personal data; not needed for global history (AGENTS.md rule 4). |
| 6 | `GET /api/v1/play/history/{walletAddress}?start&end&roundAddresses` | Wallet paginated history | NOT probed | Per-wallet only (`start/end` ints, `roundAddresses` 1–20 CSV). No global form. Probing real wallets would scrape personal bettors — forbidden. |
| 7 | `GET /api/v1/play/stats/{walletAddress}` | Wallet all-time stats | NOT probed | Same reason. Doc: zero values for empty wallets. |

Write routes `POST /play/bets/prepare`, `POST /play/claims/prepare` exist in
schema but were **never called** (no trades per AGENTS.md rule 3).

## Timeline query-parameter matrix (verified host)

| Params | HTTP | Rows observed | Changes results? |
|---|---|---|---|
| `asset=BTC&before=5&after=1` | 200 | 7 (`btc-…900 … btc-…260`, `serverTime …258`) | Baseline (5 settled + live + future pattern). |
| `asset=BTC&before=20&after=20` | 200 | 41 (`…0060 … …2460`) | YES — max window 20+1+20. Proves upper bound; no way to ask for 21+. |
| `asset=BTC&before=0&after=0` | 200 | 1 (current only) | YES — minimum window. |
| `asset=BTC` (defaults) | 200 | 11 | YES — defaults 5/5 confirmed. |
| (no asset) | 400 `invalid_value` | 0 | Requires `asset ∈ {BTC,SOL}`. |
| `before=21` | 400 `too_big … <=20` | 0 | Hard cap 20 enforced server-side. |
| `+&cursor=1791345660` (undocumented) | 200 | 7 (same shape, shifted only by wall-clock) | NO — unknown param silently ignored. **No cursor pagination.** |
| `before/after/cursor/history/archive/settled` as path segments | — | — | No such paths in 85-path schema. Not probed (would be guessing URLs). |

Conclusion: **no historical timeline, pagination, round-by-id, before/after-cursor,
or archive route exists** on the verified host. History = iterate single-round
GETs over minute-aligned `openTs` within retention (floor `1790364060`,
see `PRICE_RETENTION.md`).

## Single-round GET behavior

| `openTs` | HTTP | Body |
|---|---|---|
| Recent settled (`…60000`) | 200 | `settled/UP`, `openPrice 84008309230`, `closePrice 84059282751`, pools, `claimDeadlineTs`, obs ts. |
| Live (`…1260` at probe time) | 200 | `live/UNRESOLVED`, `openPrice` set, `closePrice null`. |
| Future (`…1320`) | 200 | `betting/UNRESOLVED`, null prices/pools. |
| Floor (`1790364060`) | 200 | `settled/UP` — oldest observed. |
| Below floor (`1790361720`) | 404 | `{"code":"round_not_found","message":"round not found"}`. |
| Off-grid (`…0030`) | 400 | `openTs must be … divisible by 60`. |

## Production frontend history research (FRONTEND_OBSERVED, bundles fetched 2026-10-07)

Entry: `https://jup.ag/prediction/arcade` (200, links from `/prediction` nav
`href="/prediction/arcade"`). Chunks (current hashes):
`assets/arcade-YTzcvXJt.js` (83KB, sha `1cc692fc…`),
`assets/OneMinuteHistory-BIZDlm5V.js` (17.6KB, sha `d4edb72b…`),
`assets/arcade-DrY1dEY8.js` (route shell, 487B).
Saved under `/tmp/jup-*.js` + `/tmp/jup-arcade.html` (not committed; hashes noted).

Exact frontend request construction (minified identifiers mapped by context):

```text
BASE_URL = env PREDICTION_MARKET_API_URL ?? "https://api.jup.ag"
CONFIG  = GET {BASE}/prediction/v1/play/config
ROUNDS  = GET {BASE}/prediction/v1/play/rounds?{asset[,before,after]}   // searchParams=d(e)
ROUND   = GET {BASE}/prediction/v1/play/rounds/{asset}/{openTs}
POSITION= GET {BASE}/.../rounds/{asset}/{openTs}/positions/{wallet}
HISTORY = GET {BASE}/prediction/v1/play/history/{wallet}?{roundAddresses} // per-wallet
PAGINATED_HISTORY = GET {BASE}/.../history/{wallet}?{start,end}           // per-wallet
TRADES_WEBSOCKET = wss://prediction-market-price-service.fly.dev/ws/play/trades
```

- `rounds({asset})` query selects from ONE timeline response:
  sort by `openTs`; `LIVE = openTs<=serverTime<closeTs`;
  `PAST = closeTs<=serverTime`; `NEXT/FUTURE = openTs>serverTime`.
  History rail = `(PAST ?? []).slice(-5)` — **last 5 settled rounds only**,
  `refetchInterval: 5e3`. No global archive call exists in either chunk.
- `round(asset, openTs)` single GET guarded by `openTs>0`; used for detail modal.
- `cryptoPrice(symbol, {timestamp: closeTs})` with `enabled: closePrice===null`
  — REST price polled as *provisional* close for unsettled rounds only.
- `history({walletAddress, roundAddresses:[roundAddress]})` refetch 5s until
  settled+claimed; `paginatedHistory({walletAddress,start,end})` for wallet pages.
- Client policy: `retry:3, retryDelay:2e3`; HTTP 429 → `Rate Limit Exceeded`.

## What was NOT probed (and why)

- `https://api.jup.ag/prediction/v1/play/*` — FRONTEND_OBSERVED alternative
  base. Host not in `assertSafeJupiterUrl` allowlist; probing it would need an
  allowlist change + audit. Treated as untrusted until verified. Our harvest
  uses the independently verified `prediction-market-api.jup.ag` host only.
- `wss://…/ws/play/trades` — observed string only; no WS connection attempted
  (GET-only rule for this phase).
- Wallet history/stats/positions with real addresses — would scrape personal
  bettors beyond aggregate research (AGENTS.md rule 4). Documented, not called.
- `/api/v1/history`, `/api/v2/history`, `/api/v1/trades`, `/api/v1/positions*`,
  `/api/v1/events*`, `/api/v1/orders*` — mainstream Prediction (non-Arcade)
  product family per `docs/01_SOURCE_DISCOVERY.md`; not substitutes for Arcade
  rounds. Listed, not probed for round history.

Raw evidence: `research/history/round-matrix-raw.json` (14 rows with
status/sha/summary/err). OpenAPI path list: SQLite `arcade.openapi.full`.
