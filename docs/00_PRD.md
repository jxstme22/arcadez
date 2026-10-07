# Product requirements — Arcade Decisions V0

**Owner intention:** A clean, reproducible, fully separate research project. After unattended agent build, operator pastes OpenAI, TypeSafe and Fastino keys and starts Jupiter-only, BTC-only **paper trading**, then monitors independently scored results. First-class: data provenance, deadline-correctness, autonomous agents with GSD checkpoints.

## User stories

1. As an operator, I can run an offline demo and tests with no key, no network or real bet.
2. As an operator, I can provide three inference API keys by editing one ignored `.env` file and verify keys are present without printing them.
3. As an operator, I can discover the official/observed Jupiter read-only Arcade routes, collect raw price and round data, and inspect persisted receive/source timestamps.
4. As an operator, I can see each provider's same-round prediction, model ID, raw numerical confidence/probability, response latency, abstention cause and subsequent Jupiter official result.
5. As a researcher, I can evaluate paired Brier / accuracy / coverage and later a historical pattern arm without editing historical labels or inspecting future data at prediction time.
6. As a reviewer, I can replay fixtures, re-run all automated tests, audit source host allowlists and see exact blocking issues.

## MUST have (V0)

- UTC millisecond source/receive/as-of timestamps; stable round IDs and per-round once-only decisions.
- Jupiter-only price events, observed venue round metadata, official venue settlement; backfill clearly disjoint.
- Three separate model adapter clients, same frozen serializable market evidence and binary target, independent timeouts; no other model fed another's response.
- One stable paper decision timing (candidate T-10s), conservative stale-data cutoff, deadline T-3s until authoritative lock established; model-output probability is **uncalibrated score** until tested.
- Paper `UP`, `DOWN`, `SKIP`; null PnL until verified prelock odds/fees; no wallet; separate test/demo provenance.
- SQLite plus raw JSON payloads retained locally; dashboard bound to loopback only; nonzero exit on failed source audit.
- Dated GSD agent reports that expose missing credentials and partial completion, rather than invented success.

## SHOULD have (P4/P5)

- Anti-duplication under restart, gap detection and reconnect backoff; process uptime monitoring; source clock drift warnings.
- Observed odds snapshots with verified timestamp/settlement methodology; paper PnL only after exact-match test.
- Explicit benchmark fairness report for common eligible rounds, plus each arm's independent eligibility.
- 16–32 pre-registered regimes and nearest-neighbor research; scenario simulation as separate experiment.

## Out of scope

No real trades, keys for any wallet, order construction or signing; no SOL, no CEX/Pyth/Polymarket features, no inference fine-tuning, no mobile release, no claiming guaranteed 50%+ forecasting, no deceptive historical "live" backtest. No deployment or account purchases. Do not conflate Jupiter Forecast 15m Prediction API and Arcade 1m /play.

## Nonfunctional requirements

- All provider requests bounded by local deadline and session caps. No key must appear in any saved event.
- Live clock must be reasonably synced (NTP recommended); hard skip on anomalous source times.
- Backfill never becomes an eligible live event. Database integrity and replay invariants tested.
- Safe on provider outages: capture continues while affected model records `ERROR`/`LATE`/`DISABLED`.
- Favor simple transparent math and observable failure over unvalidated confidence promises.
