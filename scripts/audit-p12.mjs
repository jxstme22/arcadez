// Hostile P12 audit — run against a benchmark DB (default ./var/p12-live).
// Exits 0 PASS, 1 findings, 2 no-benchmark. Reusable at P12 completion.
import {Store} from '../src/store.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {loadEnv, config} from '../src/config.mjs';
loadEnv();
const cfg = config();
const dir = process.argv[2] || './var/p12-live';
if (!fs.existsSync(dir + '/arcade.sqlite')) { console.log(JSON.stringify({at: new Date().toISOString(), dir, verdict: 'NO_BENCHMARK_YET'})); process.exit(2); }
const store = new Store(dir);
const findings = [];
const add = (check, rows) => { if (rows?.length) findings.push({check, count: rows.length, sample: rows.slice(0,5)}); };
add('duplicate_round_ids', store.db.prepare('SELECT id, COUNT(*) c FROM (SELECT id FROM rounds UNION ALL SELECT id FROM historical_rounds) GROUP BY id HAVING c>1').all());
add('snapshot_reuse_across_rounds', store.db.prepare('SELECT snapshot_sha, COUNT(DISTINCT round_id) r FROM decisions WHERE snapshot_sha IS NOT NULL GROUP BY snapshot_sha HAVING r>1').all());
add('multi_hash_rounds', store.db.prepare('SELECT round_id, COUNT(DISTINCT snapshot_sha) h FROM decisions GROUP BY round_id HAVING h>1').all());
add('request_before_snapshot_freeze', store.db.prepare('SELECT d.round_id FROM decisions d JOIN snapshots s ON s.round_id=d.round_id WHERE d.sent_ms IS NOT NULL AND d.sent_ms < s.as_of_ms LIMIT 5').all());
add('late_counted_valid', store.db.prepare("SELECT round_id, arm FROM decisions WHERE status='LATE' AND action != 'SKIP' LIMIT 5").all());
add('settlement_before_response', store.db.prepare('SELECT d.round_id FROM decisions d JOIN rounds r ON r.id=d.round_id WHERE d.received_ms IS NOT NULL AND r.end_ms < d.received_ms - 120000 LIMIT 5').all());
add('sol_contamination', store.db.prepare("SELECT COUNT(*) n FROM raw_btc_ticks WHERE symbol IS NOT NULL AND symbol != 'BTC'").get().n > 0 ? [{x:1}] : []);
add('probability_inversion', store.db.prepare(`SELECT round_id, arm, p_up, action FROM decisions WHERE status='OK' AND p_up IS NOT NULL AND ((p_up >= ${cfg.upThreshold} AND action != 'UP') OR (p_up <= ${cfg.downThreshold} AND action != 'DOWN') OR (p_up > ${cfg.downThreshold} AND p_up < ${cfg.upThreshold} AND action != 'SKIP')) LIMIT 5`).all());
add('excluded_losses_settled_unscored', store.db.prepare("SELECT d.round_id FROM decisions d JOIN rounds r ON r.id=d.round_id LEFT JOIN paper p ON p.round_id=d.round_id AND p.arm=d.arm WHERE r.result IN ('UP','DOWN') AND p.result IS NULL LIMIT 5").all());
// Freeze integrity.
let freezeOk = null;
try {
  const freeze = JSON.parse(fs.readFileSync('data/benchmark/p12-freeze.json','utf8'));
  freezeOk = Object.entries(freeze.sourceHashes).every(([f,h]) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === h);
  if (!freezeOk) findings.push({check: 'freeze_hash_drift', count: 1});
} catch { findings.push({check: 'freeze_file_missing', count: 1}); }
const out = {at: new Date().toISOString(), dir, findings, freezeOk, verdict: findings.length ? 'FAIL' : 'PASS'};
console.log(JSON.stringify(out, null, 2));
store.close();
process.exit(findings.length ? 1 : 0);
