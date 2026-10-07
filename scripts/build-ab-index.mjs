// Precompute frozen A/B neighbor index from V2 checkpoint TRAIN split (offline, $0).
// Output data/benchmark/ab-index.json: kept cols, scaler, tertiles, standardized TRAIN vectors.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {plVector, FEATURE_SETS, redundancyAudit} from '../src/plfeatures.mjs';
import {fitScaler, applyScaler} from '../src/pllearn.mjs';
const DB = process.env.PL_DB || 'var/pattern-lab/v2/source/history-checkpoint.db';
const fr = fs.readFileSync('research/pattern-lab/v2/r/TEST_FREEZE.md', 'utf8');
const kept = fr.match(/Kept cols \(\d+\): (.+)/)[1].split(',');
const ids = new Set(JSON.parse(fs.readFileSync('var/pattern-lab/v2/r/splits/train.json', 'utf8')).map(r => r.id));
const d = new DatabaseSync(DB, {readOnly: true});
const all = d.prepare(`SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
const prices = new Map(d.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
d.close();
const rows = [], prev = [];
for (const r of all) {
  const b = plVector(prices, r, 60, prev); prev.push(r);
  if (!ids.has(r.id) || !b.eligible) continue;
  if (kept.some(k => b.vec[k] == null || !Number.isFinite(b.vec[k]))) continue;
  rows.push({id: r.id, startMs: r.startMs, label: r.result, x: kept.map(k => b.vec[k])});
}
const sc = fitScaler(rows);
function tertile(vals, p) { const a = [...vals].sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.floor(p*a.length))]; }
// Same tertile rule as V2-R quantileGrid, recomputed deterministically on the same TRAIN set.
const g = c => rows.map(r => r.x[kept.indexOf(c)]);
const T = {mLo: tertile(g('ret_60'),1/3), mHi: tertile(g('ret_60'),2/3), vLo: tertile(g('vol_300'),1/3), vHi: tertile(g('vol_300'),2/3)};
const idx = {version: 'ab-index-v1-20261007', keptCols: kept, scaler: sc, tertiles: T,
  train: rows.map(r => ({id: r.id, startMs: r.startMs, label: r.label, raw: r.x, z: applyScaler(sc, r.x)}))};
idx.sha = crypto.createHash('sha256').update(JSON.stringify({k: idx.keptCols, s: idx.scaler, t: idx.train})).digest('hex');
fs.mkdirSync('data/benchmark', {recursive: true});
fs.writeFileSync('data/benchmark/ab-index.json', JSON.stringify(idx));
console.log(`index: train=${rows.length} dim=${kept.length} sha=${idx.sha.slice(0,16)}`);
