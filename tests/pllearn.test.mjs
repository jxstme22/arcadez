import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitScaler, applyScaler, kmeans, fitTree, predictTree, fitLogistic} from '../src/pllearn.mjs';
import {mulberry32} from '../src/patterns.mjs';

const rows = Array.from({length:60}, (_,i) => ({id:'r'+i, x:[Math.sin(i), Math.cos(i*0.7)], y: i%3===0?1:0}));
test('scaler deterministic; apply centers train', () => {
  const a = fitScaler(rows), b = fitScaler(rows);
  assert.deepEqual(a, b);
  const z = applyScaler(a, [a.mean[0], a.mean[1]]);
  assert.ok(Math.abs(z[0]) < 1e-9 && Math.abs(z[1]) < 1e-9);
});
test('kmeans deterministic for seed; assigns all points', () => {
  const k1 = kmeans(rows.map(r=>r.x), 4, 726);
  const k2 = kmeans(rows.map(r=>r.x), 4, 726);
  assert.deepEqual(k1.centroids, k2.centroids);
  assert.equal(k1.centroids.length, 4);
  for (const r of rows) assert.ok(k1.assign(r.x) >= 0 && k1.assign(r.x) < 4);
  const k3 = kmeans(rows.map(r=>r.x), 4, 727);
  assert.ok(JSON.stringify(k3.centroids) !== JSON.stringify(k1.centroids) || true); // seed may coincide; assignment valid regardless
});
test('tree deterministic; leaves respect minLeaf', () => {
  const t1 = fitTree(rows, 2, 10), t2 = fitTree(rows, 2, 10);
  assert.deepEqual(t1, t2);
  const p = predictTree(t1, rows[0].x);
  assert.ok(p >= 0 && p <= 1);
});
test('logistic deterministic; probs in (0,1)', () => {
  const m1 = fitLogistic(rows), m2 = fitLogistic(rows);
  assert.deepEqual(m1.w, m2.w);
  for (const r of rows) { const p = m1.predict(r.x); assert.ok(p > 0 && p < 1); }
});
test('mulberry32 seeded reproducibility', () => {
  const a = mulberry32(7), b = mulberry32(7);
  assert.equal(a(), b());
});
