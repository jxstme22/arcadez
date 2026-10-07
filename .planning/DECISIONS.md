# Architecture decision records

- ADR001 2026-10-07: clean-room new repo rather than old trading-agent code. Research reports are hypothesis context only.
- ADR002 2026-10-07: strict Jupiter-native BTC-only price/round/settlement data; model vendors only inference.
- ADR003 2026-10-07: three independent same-time models, no ensemble and no per-arm tuning on future tests.
- ADR004 2026-10-07: Node >=22.13 zero-runtime-dependencies ESM + built-in SQLite to permit immediate offline start without npm registry. Convert to strict TypeScript as a documented phase enhancement after live source schema; do not block safe starter on it.
- ADR005 2026-10-07: proven source GET route and live WS message schema required before positive paper predictions; fail closed if unknown.
- ADR006 2026-10-07: no made-up payout quote, hence PnL NULL until venue fee/odds independently reproduced.
- ADR007 2026-10-07: historical backfill tagged and physically segregated from live ticks; scenario forecasts are research-only.
- ADR008 2026-10-07: no wallet/execution API or automated paid-account usage; overnight local agent owns code only.
