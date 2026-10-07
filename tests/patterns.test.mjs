import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REGIMES, regimeHash, classifyRegime, scenarioPaths, neighbors, buildEvidencePacket, PATTERN_VERSION} from '../src/patterns.mjs';

test('regime library is 16-32 frozen versioned', () => {
  assert.ok(REGIMES.length >= 16 && REGIMES.length <= 32);
  assert.equal(new Set(REGIMES.map(r=>r.id)).size, REGIMES.length);
  assert.equal(regimeHash().length, 64);
  assert.match(PATTERN_VERSION, /pattern-lab/);
});

test('classification uses only past features, deterministic', () => {
  const f = {last_price_usd:84000, observed_returns_bps:{'return_60s_bps':12}, realized_volatility_sample_bps:3, direction_flips_60s:1};
  const a = classifyRegime(f), b = classifyRegime(f);
  assert.equal(a, b);
  assert.ok(REGIMES.some(r=>r.id===a));
  assert.equal(classifyRegime(null), null);
});

test('scenario bootstrap is seeded reproducible and bounded', () => {
  const past = Array.from({length:50}, (_,i)=> (i%3===0? 5 : -3) + (i%7));
  const s1 = scenarioPaths({pastReturnsBps:past, seed:726, paths:100});
  const s2 = scenarioPaths({pastReturnsBps:past, seed:726, paths:100});
  assert.deepEqual(s1, s2);
  assert.ok(s1.simulated_up_fraction >= 0 && s1.simulated_up_fraction <= 1);
  assert.match(s1.note, /UNCALIBRATED/);
  assert.throws(()=>scenarioPaths({pastReturnsBps:[1,2], seed:1, paths:10}), /INSUFFICIENT/);
});

test('neighbors enforce time embargo, no future leakage', () => {
  const train = [
    {id:'a', asOfMs:1000, vec:[1,0], label:'UP'},
    {id:'b', asOfMs:2000, vec:[1.1,0], label:'DOWN'},
    {id:'future', asOfMs:9999999, vec:[1,0], label:'UP'},
  ];
  const q = {asOfMs:5000, vec:[1,0]};
  const n = neighbors({trainVectors:train, query:q, k:5, embargoMs:1000});
  assert.ok(!n.members.some(m=>m.id==='future'));
  assert.equal(n.k, 2);
  const embargoed = neighbors({trainVectors:train, query:{asOfMs:1500, vec:[1,0]}, k:5, embargoMs:1000});
  assert.equal(embargoed.k, 0);
});

test('evidence packet is shadow-only and provider-neutral', () => {
  const p = buildEvidencePacket({feature:{last_price_usd:84000, price_age_ms:500}, regime:{regime:'H-up-low-smooth', n:8, upRate:0.625}, neighborResult:{k:5, upFraction:0.6}, scenarioResult:{paths:100, simulated_up_fraction:0.55}, wsHealth:{lastTickAgeMs:700}});
  assert.equal(p.status, 'SHADOW_ONLY_NOT_FOR_INFERENCE');
  assert.equal(p.matched_regime.id, 'H-up-low-smooth');
  assert.equal(p.scenario_simulation.up_rate, 0.55);
  const empty = buildEvidencePacket({});
  assert.equal(empty.nearest_neighbors.n, 0);
});
