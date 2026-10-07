# Live causal pipeline — T-7 primary (frozen)

Per target round N (id `btc-{openTs}`): collect ticks/rounds continuously; at
cutoff=open−7000ms (tolerance +2000ms, once per round) freeze `featuresRich(ticks,
cutoff)` (receive_ts<=cutoff enforced); persist snapshot+hash (`<id>@T-7`) and
frozen micro features (`microsnap.<id>` evidence); run 11 arms (A0/A1 always,
A2-4 momentum signs, A5 grid-pattern, A6/A7 shadow-SKIP, A8 micro-NN gated at 100
nodes + frozen-once scaler, A9/A10 shadow-SKIP); persist all predictions BEFORE open
(UNIQUE round,arm); at settlement score frozen arms; create MICRO node ONLY from
frozen T-7 features (cutoff match enforced); update watermarks. T-60/30/15/10/5/3
snapshots supported by the same builder but excluded from the primary universe.
