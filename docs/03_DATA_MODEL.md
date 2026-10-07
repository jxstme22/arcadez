# Data provenance & database dictionary

## Tables already implemented

`raw_events(source,kind,source_ms,received_ms,sha,payload)` append-only observed inbound messages; JSON preserved; no secrets. `ticks(price,source_ms,received_ms,provenance)` accepted fresh WS tick subset. `rounds(id,start_ms,end_ms,open_micro,close_micro,result,first_seen_ms,last_seen_ms,raw)` latest official venue view with raw observation trace. `snapshots(round_id,as_of_ms,hash,snapshot,provenance)` one frozen time-causal input per target. `decisions(round_id,arm,status,p_up,action,sent_ms,received_ms,model,error_code,snapshot_sha,answer,usage)` provider outputs. `paper(round_id,arm,action,stake_usdc,result,correct,pnl_usdc,pnl_status)` single virtual position with payout fields intentionally NULL. `evidence(key,captured_ms,sha,payload)` captured schema/audits.

## Future required additions

- Source connection session and reconnect reason, interval gaps, and tick clock-offset distribution.
- `pool_observation(round_id,source_ts,received_at,up_stake_micro,down_stake_micro,odds_raw,fee_raw,lock_provenance,sha)`, and quote-reconstruction tests.
- `run(run_id,git_sha,model_alias,resolved_model_id,policy_version,prompt_sha,currency,cost_budget,started_at,ended_at,source_versions)`.
- `feature_schema_version`, `feature_flags`, null missingness causes; no forward fill.
- `historical_price(price_ts,lookup_request_ts,lookup_received_at,price,raw,provenance='HISTORICAL_BACKFILL')` distinct from live ticks.
- `settlement_verification(provenance_class,source_report,verified_at,hash)`; exact on-chain verified vs venue recorded vs hypothesized, no downgrade/upgrade by implication.
- Quote and payout calculation status, pre-lock quote received timestamp, own-stake impact, final outcome rules and fee rounding.

## Exactness & units

Prices in venue micro units must be **decimal strings** or BigInt (never IEEE float) for win/VOID labels. Live floating price tick may be float for returns only. Returns expressed in basis points (`bps` = price ratio ×10,000); realized volatility estimator version explicit; timestamp `*_ms` always Unix UTC milliseconds. Store amount as USDC decimal or integer micro USDC before applying exact payout formulas.

## Information-causality invariant

At prediction cutoff `T`, accepted live tick has `event_source_ms <= T`, `received_at_ms <= T`, `received_at_ms >= T - retention_window`, and fresh age less than configured bound; ensure event source isn't implausibly beyond its own receipt. Store `as_of_ms` frozen before provider calls, not at response time. Record decision request/answer times separately. A price backfilled later has a late `lookup_received_at_ms`, never spoof its timestamp.

## Integrity checks

1. One `(round_id,arm)` action, duplicate insertion ignored and audited.
2. No prediction feature includes future opening or closing price for target round.
3. All normalized `roundId` come from actual venue record, never minted for missing historic minutes.
4. Source events are immutable; normalized projection changes are versioned, not rewriting raw.
5. Round labels come from exact micro open/close plus authoritative VOID state, never inferred from exchange/CEX.
6. Data gaps or unknown timestamp units must null features and mark ineligible.
7. Demo fixture and live databases cannot be silently merged.
