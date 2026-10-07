# V2 source manifest — 2026-10-07 (Session V2, read-only checkpoint)

- Method: `VACUUM INTO var/pattern-lab/v2/source/history-checkpoint.db` from a readOnly
  open of `./var/history/arcade.sqlite`. Source unmutated; Session B untouched.
- Checkpoint (authoritative self-count): 2569 rounds, **2564 labelled UP/DOWN**,
  3615 prices. Gate ≥2500: **PASS**.
- Session-B live counts at inspection: 2568/2563 (one row landed mid-copy; VACUUM is
  transactional — checkpoint is internally consistent).
- Later growth → V3, never in-place V2 mutation.
