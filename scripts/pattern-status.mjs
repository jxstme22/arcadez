// pattern:status — read-only Nodes runtime status. No writes, no inference.
import {NodeStore} from '../src/nodes.mjs';
import {supportGate, lifecycleStep} from '../src/nodepolicy.mjs';
import fs from 'node:fs';
const store = new NodeStore(process.env.NODES_DIR || 'var/pattern-nodes');
const q = (sql, a = []) => { try { return store.db.prepare(sql).all(...a); } catch { return null; } };
const one = (sql, a = []) => { try { return store.db.prepare(sql).get(...a); } catch { return null; } };
const obs = one('SELECT COUNT(*) n FROM observation_nodes')?.n ?? 0;
const pats = q('SELECT pattern_id, status, support_total, up_total FROM pattern_nodes') ?? [];
const mem = one('SELECT COUNT(*) n FROM node_pattern_membership')?.n ?? 0;
const novel = one('SELECT COUNT(*) n FROM novelty_buffer')?.n ?? 0;
const preds = one('SELECT COUNT(DISTINCT round_id) n FROM pattern_predictions')?.n ?? 0;
const wm = k => store.getWatermark(k);
// Freshness distribution over grid patterns (recent-250 vs total).
const fresh = [];
for (const p of pats.filter(x => x.pattern_id.startsWith('SEED-GRID:') || x.pattern_id === 'SEED-GRID')) void p;
const members = q(`SELECT m.pattern_id AS pid, o.outcome AS y, o.open_ts AS ts FROM node_pattern_membership m
  JOIN observation_nodes o ON o.node_id=m.obs_node_id WHERE m.pattern_id LIKE 'SEED-GRID:Q-%'`) ?? [];
const byPat = {};
for (const m of members) { (byPat[m.pid] = byPat[m.pid] || []).push(m); }
const freshDist = {};
for (const [pid, rows] of Object.entries(byPat)) {
  const rs = [...rows].sort((a,b) => b.ts - a.ts).slice(0, 250);
  const hist = rows.filter(r => r.y === 'UP').length / Math.max(1, rows.length);
  const rec = rs.length >= 10 ? rs.filter(r => r.y === 'UP').length / rs.length : null;
  const dev = rec == null ? null : Math.abs(rec - hist);
  const st = rec == null ? 'INSUFFICIENT' : dev > 0.15 ? 'STALE' : dev > 0.08 ? 'DEGRADED' : dev > 0.04 ? 'WATCH' : 'FRESH';
  freshDist[st] = (freshDist[st] || 0) + 1;
}
// Paper benchmark from prediction_results.
const arms = q(`SELECT arm, COUNT(*) n, SUM(CASE WHEN correct=1 THEN 1 ELSE 0 END) w FROM prediction_results WHERE correct IS NOT NULL GROUP BY arm`) ?? [];
let disk = null;
try { disk = fs.readdirSync(store.dir).reduce((a, f) => { try { return a + fs.statSync(store.dir + '/' + f).size; } catch { return a; } }, 0); } catch {}
console.log(JSON.stringify({
  at: new Date().toISOString(), dir: store.dir,
  observationNodes: obs, patternDefs: pats.length, memberships: mem, noveltyBuffer: novel,
  benchmarkRounds: preds, arms,
  freshnessDistribution: freshDist,
  watermarks: {scoredThrough: wm('replay_scored_through')},
  diskBytes: disk, inference: 'PAPER_ONLY_NO_MODEL_CALLS',
}, null, 2));
store.close();
