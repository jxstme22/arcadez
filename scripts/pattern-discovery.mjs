// Pattern discovery validation — TRAIN fit, VALIDATION select, TEST report. No tuning on TEST.
import {Store} from '../src/store.mjs';
import {buildVectors, chronoSplit, fitThresholds, assignRegime, wilson, HISTORY_VERSION} from '../src/history.mjs';
import fs from 'node:fs';
const store = new Store('./var/history');
const {rows, skipped} = buildVectors(store);
store.close();
const {train, validation, test} = chronoSplit(rows, [0.6, 0.2, 0.2]);
const {thresholds, norms, hash} = fitThresholds(train);
const stats = split => {
  const byReg = {};
  for (const r of split) {
    const id = assignRegime(r.vec, thresholds);
    (byReg[id] = byReg[id] || {n:0, up:0}).n++;
    if (r.label === 'UP') byReg[id].up++;
  }
  return Object.entries(byReg).map(([id,s]) => ({regime:id, n:s.n, up:s.up, upRate:+(s.up/s.n).toFixed(4), ci95:wilson(s.up,s.n)}))
    .sort((a,b)=>b.n-a.n);
};
const out = {version: HISTORY_VERSION, thresholdsHash: hash, thresholds,
  hypothesesTested: {gridsConsidered:['H-18-quantile'], regimesScored: 18, note:'ONE grid pre-registered; 8/16/24/32/64 sweep explicitly NOT run (n=114 too small)'},
  splits: {train: train.length, validation: validation.length, test: test.length, skipped},
  train: stats(train), validation: stats(validation), test: stats(test),
  verdict: 'DESCRIPTIVE_ONLY — test split n~22; no edge claimed; min-support gate (n>=10) applied below'};
const gate = s => s.filter(r => r.n >= 10);
out.gatedTest = gate(out.test);
fs.mkdirSync('research/patterns', {recursive:true});
fs.writeFileSync('research/patterns/discovery.json', JSON.stringify(out, null, 2));
console.log(`rows=${rows.length} skipped=${skipped} train=${train.length} val=${validation.length} test=${test.length}`);
console.log('TEST regimes:', JSON.stringify(out.test, null, 1));
console.log('GATED(n>=10) test regimes:', JSON.stringify(out.gatedTest));
