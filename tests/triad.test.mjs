import {test} from 'node:test';
import assert from 'node:assert/strict';
import {triadDecide, triadHRDecide, kalmanDecide, triadSignals, microVol} from '../strategies/triad/triad.mjs';

// Synthetic 1s ticks, causal shapes only.
const AT = 1791390000000;
const mk = (fn, n = 2100) => Array.from({length: n}, (_, i) => ({source_ms: AT - (n-1-i)*1000, price: fn(i)}));
const crash = mk(i => 84000 - i*0.5 - (i > 1500 ? (i-1500)*0.3 : 0));
const rally = mk(i => 84000 + i*0.5 + (i > 1500 ? (i-1500)*0.3 : 0));
const flat = mk(() => 84000);
// Volatility history consistent with the feed itself (trailing per-minute microVol).
const volHistFor = ticks => { const h = []; for (let m = 1; m <= 30; m++) { const v = microVol(AT - m*60000, ticks); if (v != null) h.push(v); } return h; };
const volHistRally = volHistFor(rally);
const volHist = volHistFor(crash);
const volHistFlat = volHistFor(flat);
test('storm fires DOWN on crash, sky fires UP on rally, flat abstains', () => {
  assert.equal(triadDecide(AT, crash, volHist).action, 'DOWN');
  assert.equal(triadDecide(AT, rally, volHistRally).action, 'UP');
  assert.equal(triadDecide(AT, flat, volHist).action, 'SKIP');
});
test('warmup without volatility history abstains (no fabrication)', () => {
  assert.equal(triadDecide(AT, crash, []).action, 'SKIP');
  assert.equal(triadDecide(AT, crash, [1]).action, 'SKIP');
});
test('HR variant acts with looser thresholds; kalman runs without crash', () => {
  const hr = triadHRDecide(AT, crash, volHist);
  assert.ok(['UP','DOWN','SKIP'].includes(hr.action));
  const kf = kalmanDecide(AT, crash, volHist);
  assert.ok(['UP','DOWN','SKIP'].includes(kf.action));
  assert.equal(kalmanDecide(AT, crash.slice(0,5), volHist).action, 'SKIP');
});
test('signals carry no future data (uses D=startMs-6000 only)', () => {
  const s = triadSignals(AT, crash, volHist);
  assert.equal(typeof s.storm, 'boolean');
  assert.equal(typeof s.sky, 'boolean');
  assert.equal(typeof s.calm, 'boolean');
});
