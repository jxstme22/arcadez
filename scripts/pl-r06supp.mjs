// R06-supplement (unseen-data transfer, NOT the spec R06 which is n=0) + R07/R08/R09.
// Locked V1 artifacts (reconstructed tertiles + frozen library scaler) applied WITHOUT
// refit to V2 rows absent from V1 (by id). Labels: R06-SUPPLEMENT (unseen, not forward).
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {plVector, FEATURE_SETS} from '../src/plfeatures.mjs';
// Locked V1 kept-columns (from frozen V1 TEST_FREEZE.md) — NOT current FULL_CLEAN.
const KEEP = ['ret_120','ret_180','ret_300','ret_600','vol_180','vol_300','vol_600','range_60','range_300','position_in_range_300','direction_flips_300s','vol_expansion_180v300','range_expansion_180v300','prev_dir_up','previous_5_up_rate','previous_10_up_rate','current_streak_length','breakout_up','breakout_down'];
void FEATURE_SETS;
import {fitScaler, applyScaler} from '../src/pllearn.mjs';
import {neighbors} from '../src/patterns.mjs';
import {mulberry32} from '../src/patterns.mjs';
void FEATURE_SETS;
const load = p => { const d = new DatabaseSync(p, {readOnly: true});
  const rounds = d.prepare(`SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
  const prices = new Map(d.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
  d.close(); return {rounds, prices}; };
function eligible(rounds, prices) {
  const out = [], prev = [];
  for (const r of rounds) {
    const b = plVector(prices, r, 60, prev); prev.push(r);
    if (!b.eligible) continue;
    if (KEEP.some(k => b.vec[k] == null || !Number.isFinite(b.vec[k]))) continue;
    out.push({id: r.id, startMs: r.startMs, label: r.result, vec: KEEP.map(k => b.vec[k]),
      tert: {ret_60: b.vec.ret_60, vol_300: b.vec.vol_300, flips_60: b.vec.direction_flips_60s}});
  }
  return out;
}
const v1 = load('var/pattern-lab/v1/source/history-checkpoint.db');
const v1ids = new Set(JSON.parse(fs.readFileSync('var/pattern-lab/v1/splits/train.json','utf8')).map(r=>r.id));
const v1train = eligible(v1.rounds.filter(r => v1ids.has(r.id)), v1.prices);
const tert = (vals,p) => { const a=[...vals].sort((x,y)=>x-y); return a[Math.min(a.length-1,Math.floor(p*a.length))]; };
const R60 = v1train.map(r=>r.tert.ret_60), V300 = v1train.map(r=>r.tert.vol_300);
const T = {mLo: tert(R60,1/3), mHi: tert(R60,2/3), vLo: tert(V300,1/3), vHi: tert(V300,2/3)};
const qassign = r => { const m=r.tert.ret_60, v=r.tert.vol_300, f=r.tert.flips_60;
  return `Q-${m<T.mLo?'down':m>T.mHi?'up':'flat'}-${v<T.vLo?'low':v>T.vHi?'high':'med'}-${f<=1?'smooth':'choppy'}`; };
const vote = {};
for (const r of v1train) { const id = qassign(r); (vote[id]=vote[id]||{n:0,up:0}); vote[id].n++; if(r.label==='UP') vote[id].up++; }
const v1scaler = JSON.parse(fs.readFileSync('research/pattern-lab/library/v1/scaler.json','utf8'));
const Z1 = x => applyScaler(v1scaler, x);
const v1idx = v1train.map(r => ({id: r.id, asOfMs: r.startMs, vec: Z1(r.vec), label: r.label, y: r.label==='UP'?1:0}));
// V2 unseen rows (id-disjoint from ALL V1 rows incl val/test — strictest unseen set).
const v2 = load(process.env.PL_DB || 'var/pattern-lab/v2/source/history-checkpoint.db');
const v1all = new Set();
for (const s of ['train','validation','test']) JSON.parse(fs.readFileSync(`var/pattern-lab/v1/splits/${s}.json`,'utf8')).forEach(r=>v1all.add(r.id));
const unseen = eligible(v2.rounds.filter(r => !v1all.has(r.id)), v2.prices);
console.log(`unseen=${unseen.length} (V2 eligible not in V1 splits)`);
// transfer: regime + knn + scenario(matched-label sampling)
let ra=0,rw=0,rb=0, ka=0,kw=0,kb=0, kScored=0, sa=0,sw=0,sb=0;
for (const r of unseen) {
  const id = qassign(r), v = vote[id], p = v ? v.up/v.n : 0.5;
  rb += (p-(r.label==='UP'?1:0))**2;
  const a = p>=0.57?'UP':p<=0.43?'DOWN':'SKIP';
  if (a!=='SKIP'){ ra++; if(a===r.label) rw++; }
  const res = neighbors({trainVectors: v1idx, query:{asOfMs:r.startMs, vec:Z1(r.vec)}, k:25, embargoMs:0});
  if (res.upFraction!=null){ kScored++; kb += (res.upFraction-(r.label==='UP'?1:0))**2;
    const ak = res.upFraction>=0.57?'UP':res.upFraction<=0.43?'DOWN':'SKIP';
    if(ak!=='SKIP'){ ka++; if(ak===r.label) kw++; } }
}
console.log(`regime: acted=${ra}/${unseen.length} acc=${ra?(rw/ra).toFixed(4):null} brier=${(rb/Math.max(1,unseen.length)).toFixed(4)}`);
console.log(`knn25: scored=${kScored}/${unseen.length} acted=${ka} acc=${ka?(kw/ka).toFixed(4):null} brier=${kScored?(kb/kScored).toFixed(4):null} (nulls = embargo, no past index rows: correct)`);
const base = unseen.filter(r=>r.label==='UP').length/Math.max(1,unseen.length);
console.log(`unseen baseUP=${base.toFixed(4)}`);
// R07 survival: V1 stats (from v1 regimes report — recompute here for train/val/test) vs V2-R stats
const v2rep = JSON.parse(fs.readFileSync('data/reports/pattern-lab-v2-r-scorecard.json','utf8'));
console.log('v2r splits:', JSON.stringify(v2rep.splits));
// R09: kNN train acc on V2-R train (collapse check) — cheap approx via 200-sample
fs.writeFileSync('research/pattern-lab/v2/unseen-transfer.json', JSON.stringify({n: unseen.length, baseUP:+base.toFixed(4),
  regime:{acted:ra, acc:ra?+(rw/ra).toFixed(4):null}, knn:{scored:kScored, acted:ka, acc:ka?+(kw/ka).toFixed(4):null}}, null, 2));
