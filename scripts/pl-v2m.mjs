// V2-M: aligned selection (Brier-first) -> freeze -> single TEST look.
// Candidates refit on TRAIN only (same frozen code/seed as V2-R). No TEST until freeze.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {plVector, FEATURE_SETS, redundancyAudit} from '../src/plfeatures.mjs';
import {fitScaler, applyScaler, kmeans} from '../src/pllearn.mjs';
const SHA = s => crypto.createHash('sha256').update(s).digest('hex');
const OUT = 'var/pattern-lab/v2/r';
const L = s => JSON.parse(fs.readFileSync(`${OUT}/splits/${s}.json`, 'utf8')).map(r => r.id);
const DB = process.env.PL_DB || 'var/pattern-lab/v2/source/history-checkpoint.db';
function load(ids) {
  const d = new DatabaseSync(DB, {readOnly: true});
  const all = d.prepare(`SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
  const prices = new Map(d.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
  d.close();
  const want = new Set(ids); const out = [], prev = [];
  const KEEP = FEATURE_SETS.FULL_CLEAN;
  for (const r of all) {
    const b = plVector(prices, r, 60, prev); prev.push(r);
    if (!want.has(r.id) || !b.eligible) continue;
    if (KEEP.some(k => b.vec[k] == null || !Number.isFinite(b.vec[k]))) continue;
    out.push({id: r.id, startMs: r.startMs, label: r.result, full: b.vec});
  }
  return out;
}
const tIds = L('train'), vIds = L('validation'), teIds = L('test');
const TR0 = load(tIds), VA0 = load(vIds), TE0 = load(teIds);
// Same redundancy audit on TRAIN (must reproduce V2-R kept set).
const red = redundancyAudit(TR0.map(r => ({vec: Object.fromEntries(FEATURE_SETS.FULL_CLEAN.map(k => [k, r.full[k]]))})), FEATURE_SETS.FULL_CLEAN);
const drop = new Set(red.nearDuplicates.map(p => p.b));
const kept = FEATURE_SETS.FULL_CLEAN.filter(c => !drop.has(c) && !red.stats[c].constant);
const TR = TR0.map(r => ({...r, x: kept.map(k => r.full[k]), y: r.label === 'UP' ? 1 : 0}));
const VA = VA0.map(r => ({...r, x: kept.map(k => r.full[k]), y: r.label === 'UP' ? 1 : 0}));
const TE = TE0.map(r => ({...r, x: kept.map(k => r.full[k]), y: r.label === 'UP' ? 1 : 0}));
const sc = fitScaler(TR);
const Z = r => applyScaler(sc, r.x);
// Candidate configs (same family as V2-R).
function tertile(vals, p) { const a = [...vals].sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.floor(p*a.length))]; }
function quantileCfg() {
  const g = i => TR.map(r => r.full[i]);
  const T = {mLo: tertile(g('ret_60'),1/3), mHi: tertile(g('ret_60'),2/3), vLo: tertile(g('vol_300'),1/3), vHi: tertile(g('vol_300'),2/3)};
  return {id: 'quantile18', assign: r => { const m = r.full.ret_60, v = r.full.vol_300, f = r.full.direction_flips_60s;
    return `Q-${m<T.mLo?'down':m>T.mHi?'up':'flat'}-${v<T.vLo?'low':v>T.vHi?'high':'med'}-${f<=1?'smooth':'choppy'}`; }};
}
const cfgs = {quantile18: quantileCfg()};
for (const K of [8,16,24,32]) {
  const km = kmeans(TR.map(r => Z(r)), K, 726);
  cfgs[`kmeans${K}`] = {id: `kmeans${K}`, assign: r => `K${K}_${String(km.assign(Z(r))).padStart(3,'0')}`};
}
// treeLeaves omitted: needs fitTree (depth structure differs from V2-R selection set? No—V2-R included it.
// Include for parity using same fit:
const {fitTree} = await import('../src/pllearn.mjs');
{
  const tree = fitTree(TR.map(r => ({x: Z(r), y: r.y})), 2, 20);
  cfgs.treeLeaves = {id: 'treeLeaves', assign: r => { let nd = tree; const x = Z(r); while (!nd.leaf) nd = x[nd.j] <= nd.t ? nd.left : nd.right; return `T_${nd.p >= 0.5 ? 'up' : 'dn'}_${nd.n}`; }};
}
function valScore(cfg) {
  const votes = {};
  for (const r of TR) { const id = cfg.assign(r); (votes[id] = votes[id] || {n: 0, up: 0}); votes[id].n++; if (r.y === 1) votes[id].up++; }
  const minTrain = Math.min(...Object.values(votes).map(v => v.n));
  const P = r => { const v = votes[cfg.assign(r)]; return v ? v.up/v.n : 0.5; };
  const A = r => { const p = P(r); return p >= 0.57 ? 'UP' : p <= 0.43 ? 'DOWN' : 'SKIP'; };
  const acted = VA.map(r => ({r, a: A(r)})).filter(z => z.a !== 'SKIP');
  const brier = VA.reduce((s, r) => s + (P(r)-r.y)**2, 0)/VA.length;
  const el = acted.filter(z => (z.a === 'UP') === (z.r.y === 1));
  const up = acted.filter(z => z.r.y === 1), dn = acted.filter(z => z.r.y === 0);
  const tpr = up.length ? up.filter(z => z.a === 'UP').length/up.length : null;
  const tnr = dn.length ? dn.filter(z => z.a === 'DOWN').length/dn.length : null;
  const cover = acted.length/VA.length;
  const regimes = new Set(TR.map(r => cfg.assign(r))).size;
  return {brier: +brier.toFixed(4), balAcc: tpr != null && tnr != null ? +((tpr+tnr)/2).toFixed(4) : null,
    cover: +cover.toFixed(4), acted: acted.length, regimes, minTrain};
}
const scored = Object.values(cfgs).map(c => ({id: c.id, ...valScore(c)}));
const eligible = scored.filter(s => s.minTrain >= 50 && s.acted >= 20);
eligible.sort((a,b) => a.brier - b.brier || (b.balAcc ?? -1) - (a.balAcc ?? -1) || b.cover - a.cover || a.regimes - b.regimes || (a.id < b.id ? -1 : 1));
const chosen = eligible.length ? eligible[0].id : null;
const preHash = SHA(fs.readFileSync('research/pattern-lab/v2/m/PREREGISTRATION.md','utf8'));
fs.mkdirSync('research/pattern-lab/v2/m', {recursive: true});
fs.writeFileSync('research/pattern-lab/v2/m/TEST_FREEZE.md',
  `# V2-M TEST freeze\n\nChosen: ${chosen ?? 'NONE'}\nPrereg SHA: ${preHash}\nCandidates: ${JSON.stringify(scored)}\nEligible: ${JSON.stringify(eligible.map(e=>e.id))}\nTEST untouched at freeze time.\n`);
console.log(JSON.stringify({scored, eligible: eligible.map(e=>e.id), chosen, preHash: preHash.slice(0,16)}));
// ---------- single TEST look ----------
if (chosen) {
  const cfg = cfgs[chosen];
  const votes = {};
  for (const r of TR) { const id = cfg.assign(r); (votes[id] = votes[id] || {n: 0, up: 0}); votes[id].n++; if (r.y === 1) votes[id].up++; }
  const P = r => { const v = votes[cfg.assign(r)]; return v ? v.up/v.n : 0.5; };
  let acted = 0, wins = 0, brier = 0;
  const base = TE.filter(r=>r.y===1).length/TE.length;
  for (const r of TE) {
    const p = P(r); brier += (p-r.y)**2;
    const a = p >= 0.57 ? 'UP' : p <= 0.43 ? 'DOWN' : 'SKIP';
    if (a !== 'SKIP') { acted++; if ((a==='UP')===(r.y===1)) wins++; }
  }
  brier /= TE.length;
  const el = TE.map(r => { const p = P(r); const a = p>=0.57?'UP':p<=0.43?'DOWN':'SKIP'; return {a, y: r.y}; }).filter(z=>z.a!=='SKIP');
  const up = el.filter(z=>z.y===1), dn = el.filter(z=>z.y===0);
  const res = {method: chosen, n: TE.length, baseUP: +base.toFixed(4), acted, acc: acted?+(wins/acted).toFixed(4):null,
    balAcc: (up.length&&dn.length)?+(((up.filter(z=>z.a==='UP').length/up.length)+(dn.filter(z=>z.a==='DOWN').length/dn.length))/2).toFixed(4):null,
    brier: +brier.toFixed(4)};
  fs.writeFileSync('data/reports/pattern-lab-v2-m-scorecard.json', JSON.stringify(res, null, 2));
  console.log('TEST:', JSON.stringify(res));
} else {
  fs.writeFileSync('data/reports/pattern-lab-v2-m-scorecard.json', JSON.stringify({method: null, reason: 'NO_ELIGIBLE_V2M_CONFIGURATION'}, null, 2));
  console.log('NO_ELIGIBLE_V2M_CONFIGURATION');
}
