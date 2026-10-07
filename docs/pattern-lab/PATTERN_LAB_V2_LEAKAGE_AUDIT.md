# Pattern Lab V2 leakage audit — 2026-10-07 (hostile)

Verdict: **V2_R_LEAKAGE_AUDIT=PASS, V2_M_LEAKAGE_AUDIT=PASS**.

- Future target in features: no (zero forward refs in `plfeatures.mjs`; labels only from venue micros of the row itself for magnitude research on *prior* rows).
- Post-snapshot values: no (all lookups `(openSec−d)`, receive-equivalent = retrieval-bounded historical GETs; no live mixing).
- Future trajectory in engine: no (continuations sampled post-hoc from matched labels; scenario code paths separate from vector construction; verified by build order).
- Scaler/cluster fit on validation/test: no (fit calls take TRAIN arrays only; k-means/tree/logistic signatures accept single row sets; V2-R rebuild uses train split).
- Future-neighbor retrieval: no (embargo `ts < query` enforced + tested; V2 unseen analysis shows correct nulls where no past index exists).
- Split overlap / same row multiple splits: verified disjoint (test).
- Session-B data after checkpoint: none used (V2 reads its frozen copy; live `var/history` growth untouched and unread post-checkpoint).
- V2-M prereg drift: none (SHA pinned in TEST_FREEZE; prereg file unchanged since).
- TEST used for selection: no (V2-R selection used validation; V2-M ranked validation; TEST evaluated once each).
- V1 extension refit: none (reconstruction uses frozen code + frozen V1 TRAIN; library scaler loaded, never refit).
