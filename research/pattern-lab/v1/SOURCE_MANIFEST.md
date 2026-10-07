# PL00 source manifest — 2026-10-07 (Session C, read-only checkpoint)

- Method: `VACUUM INTO var/pattern-lab/v1/source/history-checkpoint.db` from a
  readOnly open of `./var/history/arcade.sqlite`. Source unmutated; Session B untouched
  (its capture process still running; counts verified equal at copy time, then frozen).
- Content: 2309 rounds (2298 VENUE_RECORDED UP/DOWN + 4 VENUE_RECORDED_VOID), 2716
  timestamp prices, window ~2026-10-05T02:00Z → 2026-10-07T12:00Z (~58h).
- Gate ≥1000 legitimate labels: **PASS (2298)**.
- VOID excluded from binary prediction (target policy PL02); kept for existence accounting.
- Full manifest: `research/pattern-lab/v1/source-manifest.json` (incl. SHA256).
- Later Session-B growth → Pattern Lab V2, never in-place V1 mutation.
