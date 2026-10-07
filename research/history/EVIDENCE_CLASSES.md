# Historical evidence classes + label policy — 2026-10-07

## Evidence classes (never mixed silently)

| Class | Definition | Count (2026-10-07 ~13:30Z, growing) |
|---|---|---|
| `ROUND_API_RECORDED` | Single-round `GET /play/rounds/BTC/{openTs}` → 200, `normalizeRound` OK, venue `outcome ∈ {UP,DOWN}` agrees with exact micro-price direction (`openPrice` vs `closePrice` as integers; mismatch → row rejected, 0 observed). Stored in `historical_rounds`, provenance `VENUE_RECORDED`. | ~1800+ (background harvest running) |
| `VENUE_RECORDED_VOID` | Same as above with `outcome VOID` / voided status. Defined, **0 observed** so far. Kept separate; never merged into UP/DOWN sets. | 0 |
| `ROUND_ONCHAIN_VERIFIED` | `ROUND_API_RECORDED` + Solana `getAccountInfo` proves an account at the venue `address` exists with `owner == programId 2DeG…Pt`. Spot-verified 2/2 sampled (oldest + newest); row-level flags for all rows are future work. | 2 spot-verified |
| `PROGRAM_CONTINUITY_INFERRED` | Program `2DeGBCAiEJd1MgMuPGDKh7svBikZa9izbnTn5p7ESzPt` is `executable:true`, `owner:BPFLoaderUpgradeab1e…` (36-byte program account, slot 454236095, 2026-10-07). Supports continuity reasoning only — **never a label**. | 1 program |
| `ROUND_EXISTENCE_UNPROVEN` | Venue `404 round_not_found` for a minute-aligned `openTs` (77 + growing, incl. 01:28–01:30 Oct 7 corroborated by 2 independent harvesters, and the degraded 10-05/10-06 region). No row synthesized; gaps stay gaps. Excluded from every labelled dataset. | 400+ and growing |
| `HISTORICAL_BACKFILL` / `HISTORICAL_BACKFILL_1S` | Timestamp price GETs (`/price/crypto/btcusdt?timestamp=` 60s grid + 1s densification). Context only. A BTC price timestamp is NOT round existence. | 2000+ / growing |

Raw on-chain evidence: `research/history/onchain/*.json` (3× `getAccountInfo`,
`base64`, slots 454236095/109/123, 2026-10-07T13:27Z). Round accounts: 139 bytes,
`executable:false`, `owner` = program. No transaction sent, no signing, no
private key, no wallet — 6 total read-only RPC calls (3 probe + 3 saved).

## Historical label policy (F)

A historical labelled row requires ALL of:

```text
valid BTC round existence evidence (ROUND_API_RECORDED or ROUND_ONCHAIN_VERIFIED)
+ open boundary (venue openPrice micro string)
+ close boundary (venue closePrice micro string)
+ direction (venue outcome cross-checked vs exact micro direction)
+ known provenance (VENUE_RECORDED* tagged per row)
```

Price history alone is insufficient — `historical_prices{,_1s}` never create
labels (enforced: `loadLabeledRounds` reads `historical_rounds` only;
`featuresAsOf` rejects non-`LIVE_RECEIVED_WS` ticks; harvest stores prices and
rounds in separate tables).

Allowed label classes: `VENUE_RECORDED`, `VENUE_RECORDED_ONCHAIN_VERIFIED`
(row-level flag; reserved until backfilled), `VERIFIED_SETTLEMENT_SOURCE_DERIVED`
(reserved, unused — no independent settlement source exists yet).
`ROUND_EXISTENCE_UNPROVEN` minutes are excluded from the primary labelled dataset
(no imputation, no carry-forward, no synthetic rows — verified by the
missing-minute audit: span − present = missing, all missing are 404s).

Pre-round price context windows (`T-600..T+60`), snapshots (`T-60..T-1`), and
5/10/15/30m aggregates are built ONLY from `source_ts <= cutoff` prices
(`src/history_rich.mjs`); the future close is the label only and never enters
features (regression-tested).
