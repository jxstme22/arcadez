// Seed observation nodes from frozen V2 checkpoint (readOnly). Append-only, idempotent.
import {DatabaseSync} from 'node:sqlite';
import {plVector, FEATURE_SETS} from '../src/plfeatures.mjs';
import {NodeStore} from '../src/nodes.mjs';
const KEEP = FEATURE_SETS.FULL_CLEAN;
const DB = process.env.PL_DB || 'var/pattern-lab/v2/source/history-checkpoint.db';
const src = new DatabaseSync(DB, {readOnly: true});
const rounds = src.prepare(`SELECT id,start_ms AS startMs,end_ms AS endMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
const prices = new Map(src.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
src.close();
const store = new NodeStore(process.env.NODES_DIR || 'var/pattern-nodes');
let inserted = 0, skipped = 0;
const prev = [];
for (const r of rounds) {
  try {
    const o = BigInt(r.openMicro), c = BigInt(r.closeMicro);
    if ((c > o ? 'UP' : c < o ? 'DOWN' : 'VOID') !== r.result) { skipped++; prev.push(r); continue; }
  } catch { skipped++; prev.push(r); continue; }
  const b = plVector(prices, r, 60, prev);
  prev.push(r);
  if (!b.eligible || KEEP.some(k => b.vec[k] == null || !Number.isFinite(b.vec[k]))) { skipped++; continue; }
  let move = null;
  try { const o = BigInt(r.openMicro), c = BigInt(r.closeMicro); move = Number((c-o)*10000n/o)/10000; } catch {}
  const ok = store.insertObservation({nodeId: `OBS_${r.id}`, roundId: r.id, openTs: r.startMs, closeTs: r.endMs,
    features: Object.fromEntries(KEEP.map(k => [k, b.vec[k]])), outcome: r.result, moveBps: move,
    quality: {missing: b.missing, horizonS: 60}, provenance: 'VENUE_RECORDED'});
  if (ok) inserted++;
}
console.log(JSON.stringify({inserted, skipped}));
store.close();
