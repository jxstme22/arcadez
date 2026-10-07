# BTC price + round retention — observed 2026-10-07 (UTC)

Method: bounded read-only GETs, 2100ms spacing, stop on 429/403.
Probe scripts: `scripts/history-retention-probe.mjs` (exponential),
`scripts/history-floor-search.mjs` (binary search, 8 steps each).
Raw JSON: `research/history/price-retention.json` (merged, includes
`floorSearch`). No 429 observed; no auth used.

## Price service — `GET /price/crypto/btcusdt?timestamp={sec}`

- Host: `prediction-market-price-service.fly.dev`, path `/price/crypto/btcusdt`.
- Latest available: `now-15min` succeeds (e.g. `1791360181 -> 84055.86` at
  `2026-10-07T08:18Z`). Live edge excluded by caller (needs settlement).
- Earliest available (floor): in `(1788769081, 1788774481]`,
  i.e. `2026-09-07T08:18Z` fails, `2026-09-07T09:48Z` succeeds.
  Span `5400s` (90 min). Conservative floor estimate: `1788774481`
  (`2026-09-07T09:48:01Z`). Retention length ≈ **30.0 days**.
- Error behavior below floor: HTTP `502` with body
  `{"error":"chainlink_fetch_failed","message":"Bad Request","symbol":"btcusdt","timestamp":...}`.
  Re-probed twice — deterministic, not transient. Above floor: HTTP `200`
  `{"symbol":"btcusdt","timestamp":sec*1000,"value":float}`.
- Granularity: 5 consecutive seconds (`1791359881..885`) each return distinct
  `timestamp=sec*1000` and distinct float values (e.g. `84087.98, 84088.34,
  84088.63, 84088.62, 84088.35`) — **1-second resolution supported**.
  Requested `sec` always equals `returned_ms/1000` on success.
- Determinism: same `ts=1791359281` requested twice 2.1s apart returned
  identical value `84242.99952482819` and identical response hash.
- Missing periods: none observed inside retention (spot checks at
  -15m/-1h/-6h/-24h/-3d/-7d/-14d all 200). Full continuity audit pending
  harvest (gaps stay gaps, never filled).
- Rate limits: none hit (0× 429 in 25 price GETs at 0.47 GET/s).
  Client policy: ≤0.5 GET/s, exponential backoff, stop on 429/403.

## Round service — `GET /play/rounds/BTC/{openTs}`

- Host: `prediction-market-api.jup.ag`, path `/api/v1/play/rounds/BTC/{openTs}`,
  `openTs` must be minute-aligned (off-grid secs 404 — prior harvest fix).
- Latest available: current minute minus settlement delay. `1791360180`
  (`2026-10-07T08:03Z`) returned `settled/UP` at `08:18Z` probe.
- Earliest available (floor): in `(1790361720, 1790364060]`,
  i.e. `2026-09-25T18:42Z` → `404 {"message":"round not found"}`,
  `2026-09-25T19:21Z` → `200 btc-1790364060 settled/UP`.
  Span `2340s` (39 min). Conservative floor estimate: `1790364060`
  (`2026-09-25T19:21:00Z`). Retention length ≈ **11.6 days**
  (≈ `16700` minute rounds).
- Error behavior below floor: HTTP `404` (`round not found`). Above floor:
  HTTP `200` single `PlayRound`. No 429 observed (20 round GETs).
- Missing periods: interior spot checks at -15m/-1h/-6h/-24h/-3d/-7d all
  `200` with expected `btc-{openTs}` id. Binary-search interior showed
  monotonic floor (fails below, succeeds above) across 8 probes; full
  minute-by-minute continuity to be proven by harvest (gaps stay gaps).
- Prior assumption (~30-day retention) **falsified for rounds**: rounds
  retain ~12 days, prices retain ~30 days. Labels therefore cap at round
  retention (~16-17k max), not price retention.

## Implications for maximum harvest

- `MINIMUM_TARGET=1000` is ~17h of rounds; `DESIRED=5000` is ~3.5 days;
  `STRONG=10000` is ~7 days; full retention is ~11.6 days (~16700 rounds).
- Price context `T-600..T+60` per round deduplicates to continuous
  second-level coverage of the same 11.6-day window (~1.0M seconds).
  At 0.5 GET/s that is ~23 days of probing — infeasible in one session.
  Policy: harvest rounds + 60s price grid first (labels + coarse context),
  then densify to 1s where budget permits, newest-first, with resume.
- Price history alone is NEVER a label (see `HISTORICAL_PROVENANCE.md`).

## Citations

- Exponential probes: `research/history/price-retention.json` → `priceProbes`,
  `roundProbes`, `granularity`, `determinism` (probedAt `2026-10-07T08:18Z`).
- Binary search: same file → `floorSearch` (probedAt `2026-10-07T08:20Z`).
- Re-verification of 502 body: manual bounded GETs `1788769081/80 → 502
  chainlink_fetch_failed`, `1788770000 → 200` (2026-10-07 ~08:22Z).
