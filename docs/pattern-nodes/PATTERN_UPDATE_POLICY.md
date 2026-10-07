# Pattern update policy — frozen Node Runtime v1.0 (`src/nodepolicy.mjs`)

FAST loop (every settled round): insert observation (once), assign to existing patterns,
bump support_total/up_total, recompute freshness classes. Thresholds: act p>=.55 / <=.45;
support gates 10/25/50/100; freshness dev 0.04/0.08/0.15; OOD radius = p95 seed distance (4.691).
SLOW loop (not yet triggered; predeclared batch +250 rounds): re-evaluate library, process
novelty buffer (>=100 → candidate cluster, needs >=50 + validation before WATCH), rebuild
regimes only as new library version (V1.1+), chronological validation, never combine versions.
New Pattern Nodes require support + stability + validation — none promoted in V1 replay.
