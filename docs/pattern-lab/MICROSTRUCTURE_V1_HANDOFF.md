# Microstructure V1 handoff — future experiment, NOT a continuation of minute-grid V2

## Why separate

V1/V2 used ~60s price grids: sub-minute structure is unresolvable there by construction
(nulls documented, never imputed). Any finding from 1-second data answers a different
question (microstructure information) and must not inherit minute-grid priors.

## Data to use

Session A live capture (`var/live/`): 1-second BTC tape with receive timestamps,
~1-second pool evolution, aggregate redacted trade bars, causal snapshots, gap ledger.
Plus P12's 100 prospective snapshots as a ready-made evaluation set (frozen, untouched).

## Horizons

T-60, T-30, T-15, T-10, T-7, T-5, T-3 — each with genuinely available tick data
(receive_ts ≤ cutoff enforced by existing `featuresRich`).

## Rules carried over

Pre-registration, chronological splits, TRAIN-only fitting, support gates, embargoed
neighbors, single TEST look, multiple-testing registry, hostile leakage audit,
no paid inference until budgeted, PnL NULL until payout verified.

## Status

`MICROSTRUCTURE_V1_HANDOFF=READY` (data flowing; design pending a future session).
