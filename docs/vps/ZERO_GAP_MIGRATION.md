# Zero-gap migration — VPS shadow vs local collectors

VPS deployed while local collectors kept running (no kills). Overlap >=30 min compares:
round IDs/settlements, tick cadence, latest price, pool states, trade bars, gaps.
Semantic agreement required (not byte-identical receive_ts). Local Session-B capture
and Session-A harvest continue independently until VPS_CANONICAL=YES; then local
collector retires to backup briefly before controlled stop.
