// P11B minimal live smoke: ONE frozen snapshot, 1 call per provider (3 total).
// Requires APPROVE_LIVE_SPEND=1 in process env. Caps clamped to 3 total / 1 per arm.
// Prints normalized summary only (no keys, no raw bodies to stdout).
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {makeRunner, ARMS} from '../src/models.mjs';
import {normalizeProviderResult} from '../src/models.mjs';
import {makeCollector} from '../src/collector.mjs';
import {discover} from '../src/discovery.mjs';
import {buildSnapshot, venueLockMs} from '../src/paper.mjs';
import fs from 'node:fs';
loadEnv();
if (process.env.APPROVE_LIVE_SPEND !== '1') {
  console.error('BLOCKED_NEEDS_EXPLICIT_SPEND_APPROVAL: 0 provider calls made.');
  process.exit(2);
}
const cfg = {...config(), maxCalls: 3, maxArmCalls: 1, dataDir: './var/p11b-smoke'};
console.log(`P11B_SMOKE caps total=${cfg.maxCalls} perArm=${cfg.maxArmCalls} keys: OpenAI=${!!cfg.openaiKey} Jev=${!!cfg.typesafeKey} GLiDE=${!!cfg.fastinoKey}`);
const store = new Store(cfg.dataDir);
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const audit = await discover(cfg, store);
  if (!audit.roundsInSchema) throw new Error('BLOCKED_UNVERIFIED_ROUNDS_ROUTE');
  const collector = makeCollector(cfg, store, console);
  collector.start();
  // Warm ticks up to 90s, then catch next round at T-10s.
  let target = null, snap = null, hash = null, now = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 8*60000) {
    now = Date.now();
    const rounds = collector.getRounds().filter(r => r.startMs > now && r.startMs - now <= 15000);
    rounds.sort((a,b) => a.startMs - b.startMs);
    target = rounds[0] || null;
    if (target && Math.abs((target.startMs - now) - cfg.beforeMs) <= 2000) {
      snap = buildSnapshot(target, collector.getTicks(), now, cfg);
      if (snap) break;
    }
    target = null;
    await sleep(500);
  }
  if (!snap || !target) throw new Error('BLOCKED_NO_FRESH_SNAPSHOT (WS ticks or round timing unavailable); 0 provider calls made.');
  hash = store.saveSnapshot(target.id, now, snap);
  const deadline = venueLockMs(target, cfg);
  const runner = makeRunner(cfg);
  const results = await Promise.all(ARMS.map(arm => runner(arm, target.id, snap, hash, deadline)));
  const norm = results.map(r => normalizeProviderResult(r.arm, r));
  for (const d of results) store.saveDecision(d, cfg.stake);
  const safe = {at: new Date().toISOString(), roundId: target.id, snapshotHash: hash,
    asOfMs: now, deadlineMs: deadline,
    calls: norm.map(n => ({provider: n.provider, model: n.model, status: n.status, pUp: n.normalized_probability_up, decision: n.decision, latencyMs: n.latency_ms, error: n.error_code}))};
  fs.mkdirSync('research/providers', {recursive:true});
  fs.writeFileSync('research/providers/smoke.json', JSON.stringify(safe, null, 2));
  // Raw safe replies (no keys — request bodies/headers never stored).
  fs.writeFileSync('research/providers/smoke-raw.json', JSON.stringify(results.map(r => ({arm: r.arm, status: r.status, answer: r.answer ?? null, usage: r.usage ?? null})), null, 2));
  console.log(JSON.stringify(safe.calls, null, 1));
  collector.stop();
  await sleep(3500); // let poll loops observe stop before DB close (avoids log-only race)
} finally { store.close(); }
