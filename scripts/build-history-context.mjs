#!/usr/bin/env node
// Build rich historical context for all labeled rounds (offline, no network).
// Stores per-round coverage + 13 snapshots + longer context as JSON.
// Raw second-level path is NOT duplicated: it reconstructs losslessly from
// historical_prices{,_1s} by timestamp range (dedup by design, documented).
import {Store} from '../src/store.mjs';
import {loadLabeledRounds, loadPriceSeries, contextPath, buildSnapshots, longerContext, RICH_VERSION} from '../src/history_rich.mjs';

const DATA_DIR = process.env.DATA_DIR || './var/history';
const store = new Store(DATA_DIR);
store.db.exec(`CREATE TABLE IF NOT EXISTS historical_context_v1(
  round_id TEXT PRIMARY KEY, built_ms INTEGER NOT NULL, rich_version TEXT NOT NULL,
  open_sec INTEGER NOT NULL, coverage_600_frac REAL, coverage_300_frac REAL,
  snapshots_json TEXT NOT NULL, longctx_json TEXT NOT NULL,
  provenance TEXT NOT NULL);`);

const rounds = loadLabeledRounds(store);
const prices = loadPriceSeries(store);
console.log(`rounds=${rounds.length} pricePoints=${prices.size} rich=${RICH_VERSION}`);
const prior = [];
let built = 0, full300 = 0, full600 = 0;
for (const r of rounds) {
  const openSec = Math.floor(r.startMs / 1000);
  const ctx = contextPath(openSec, prices, 600, 60);
  const snaps = buildSnapshots(openSec, prices);
  const long = longerContext(openSec, prices, [...prior]);
  const c600 = ctx.coverage.back600.frac, c300 = ctx.coverage.back300.frac;
  if (c300 >= 1) full300++;
  if (c600 >= 1) full600++;
  store.db.prepare(`INSERT OR REPLACE INTO historical_context_v1
    (round_id,built_ms,rich_version,open_sec,coverage_600_frac,coverage_300_frac,snapshots_json,longctx_json,provenance)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(r.id, Date.now(), RICH_VERSION, openSec, c600, c300,
      JSON.stringify(snaps), JSON.stringify(long), 'VENUE_RECORDED_PAST_ONLY_FEATURES');
  prior.push(r.result);
  built++;
  if (built % 500 === 0) console.log(`  built ${built}/${rounds.length} full300=${full300} full600=${full600}`);
}
console.log(JSON.stringify({built, full300, full600, pricePoints: prices.size, rich: RICH_VERSION}));
store.close();
