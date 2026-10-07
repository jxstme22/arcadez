# Pattern Lab V2-M correction — 2026-10-07

Preregistered (`research/pattern-lab/v2/m/PREREGISTRATION.md`, hashed at freeze):
rank by VALIDATION Brier → balanced accuracy → coverage → complexity → lexical,
with ≥20 acted validation predictions and min-train-support ≥50 required.

Validation ranking:
- quantile18 Brier 0.2507 but 0 acted → INSUFFICIENT_VALIDATION_COVERAGE.
- treeLeaves minTrain 47 → fails support gate (near miss, gate stands).
- kmeans{8,16,24,32} Brier 0.2555–0.2605 but minTrain 1–8 → fail support gate.

Result: **NO_ELIGIBLE_V2M_CONFIGURATION** (`data/reports/pattern-lab-v2-m-scorecard.json`).
The aligned-selection correction changes nothing — there is nothing qualified to
select. This strengthens the null: even the corrected rule finds no candidate.
TEST untouched by V2-M (no selection → no evaluation; TEST looks stay at V2-R's one).
