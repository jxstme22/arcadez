// Deterministic learning primitives for Pattern Lab V1 — no dependencies.
// All fitting uses TRAIN rows only (caller-enforced). Seeded RNG for reproducibility.
import {mulberry32} from './patterns.mjs';
// Standardizer fit on TRAIN matrix (array of {id, x:number[], y:0|1}).
export function fitScaler(rows) {
  const d = rows[0].x.length;
  const mean = [], sd = [];
  for (let j = 0; j < d; j++) {
    const vs = rows.map(r => r.x[j]);
    const m = vs.reduce((a,b)=>a+b,0)/vs.length;
    const v = vs.reduce((a,b)=>a+(b-m)**2,0)/vs.length;
    mean.push(m); sd.push(Math.sqrt(v) || 1);
  }
  return {mean, sd};
}
export function applyScaler(sc, x) { return x.map((v,j) => (v-mean0(sc,j))/sc.sd[j]); function mean0(s,j){return s.mean[j];} }
function dist2(a,b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i]-b[i]; s += d*d; } return s; }
// k-means++ (seeded) + Lloyd, max 100 iters. Returns {centroids, assign(x), iters}.
export function kmeans(trainX, k, seed = 726) {
  const rand = mulberry32(seed);
  const centroids = [trainX[Math.floor(rand()*trainX.length)].slice()];
  while (centroids.length < k) {
    const d2 = trainX.map(x => Math.min(...centroids.map(c => dist2(x,c))));
    const sum = d2.reduce((a,b)=>a+b,0) || 1;
    let r = rand()*sum, pick = 0;
    for (let i = 0; i < d2.length; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    centroids.push(trainX[pick].slice());
  }
  const assign = x => { let bi = 0, bd = Infinity; for (let i = 0; i < centroids.length; i++) { const d = dist2(x, centroids[i]); if (d < bd) { bd = d; bi = i; } } return bi; };
  let iters = 0;
  for (; iters < 100; iters++) {
    const groups = centroids.map(() => []);
    for (const x of trainX) groups[assign(x)].push(x);
    let moved = false;
    for (let i = 0; i < centroids.length; i++) {
      if (!groups[i].length) { // reinit to farthest point (deterministic)
        let fi = 0, fd = -1;
        for (let j = 0; j < trainX.length; j++) { const d = Math.min(...centroids.map(c => dist2(trainX[j],c))); if (d > fd) { fd = d; fi = j; } }
        centroids[i] = trainX[fi].slice(); moved = true; continue;
      }
      const next = centroids[i].map((_,j) => groups[i].reduce((a,x)=>a+x[j],0)/groups[i].length);
      if (next.some((v,j) => Math.abs(v-centroids[i][j]) > 1e-9)) moved = true;
      centroids[i] = next;
    }
    if (!moved) break;
  }
  return {centroids: centroids.map(c=>c.slice()), assign, iters, k, seed};
}
// Depth<=2 decision tree, exhaustive midpoint splits, Gini gain, minLeaf. Deterministic.
export function fitTree(rows, maxDepth = 2, minLeaf = 20) {
  const gini = rs => { if (!rs.length) return 0; const p = rs.filter(r=>r.y===1).length/rs.length; return 1 - p*p - (1-p)*(1-p); };
  function split(rs, depth) {
    const base = {n: rs.length, up: rs.filter(r=>r.y===1).length};
    if (depth >= maxDepth || rs.length < 2*minLeaf) return {leaf: true, ...base, p: rs.length ? base.up/rs.length : 0.5};
    const d = rs[0].x.length;
    let best = null;
    for (let j = 0; j < d; j++) {
      const vs = [...new Set(rs.map(r=>r.x[j]))].sort((a,b)=>a-b);
      for (let i = 0; i < vs.length-1; i++) {
        const t = (vs[i]+vs[i+1])/2;
        const L = rs.filter(r=>r.x[j]<=t), R = rs.filter(r=>r.x[j]>t);
        if (L.length < minLeaf || R.length < minLeaf) continue;
        const gain = gini(rs) - (L.length*gini(L)+R.length*gini(R))/rs.length;
        if (!best || gain > best.gain + 1e-12) best = {j, t, gain};
      }
    }
    if (!best || best.gain <= 1e-9) return {leaf: true, ...base, p: base.up/base.n};
    const L = rs.filter(r=>r.x[best.j]<=best.t), R = rs.filter(r=>r.x[best.j]>best.t);
    return {leaf: false, ...base, p: base.up/base.n, j: best.j, t: best.t, gain: +best.gain.toFixed(6), left: split(L, depth+1), right: split(R, depth+1)};
  }
  return split(rows, 0);
}
export function predictTree(tree, x) {
  let n = tree;
  while (!n.leaf) n = x[n.j] <= n.t ? n.left : n.right;
  return n.p;
}
// Batch gradient-descent logistic regression, fixed schedule. Deterministic.
export function fitLogistic(rows, {lr = 0.5, iters = 500, l2 = 1e-4} = {}) {
  const d = rows[0].x.length;
  let w = new Array(d).fill(0), b = 0;
  const sig = z => 1/(1+Math.exp(-Math.max(-500, Math.min(500, z))));
  for (let it = 0; it < iters; it++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (const r of rows) {
      const p = sig(r.x.reduce((a,x,j)=>a+x*w[j],b) + b*0); // b folded once
      const e = p - r.y;
      for (let j = 0; j < d; j++) gw[j] += e*r.x[j];
      gb += e;
    }
    for (let j = 0; j < d; j++) w[j] -= lr*(gw[j]/rows.length + l2*w[j]);
    b -= lr*gb/rows.length;
  }
  return {w: w.slice(), b, predict: x => { const z = x.reduce((a,v,j)=>a+v*w[j],b); return 1/(1+Math.exp(-Math.max(-500,Math.min(500,z)))); }};
}
