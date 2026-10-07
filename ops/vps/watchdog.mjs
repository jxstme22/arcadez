// Watchdog: read-only health checks + optional safe restarts (--fix).
// Never deletes data, never fabricates observations, never backfills predictions.
import {execSync} from 'node:child_process';
import fs from 'node:fs';
const ROOT = process.env.ARCADE_ROOT || '/data/arcade/app';
const LIVE = process.env.LIVE_DIR || '/data/arcade/live';
const fix = process.argv.includes('--fix');
const out = {at: new Date().toISOString(), checks: [], actions: []};
function check(name, ok, detail = null) { out.checks.push({name, ok: !!ok, detail}); }
function svc(name) {
  try {
    const st = execSync(`systemctl is-active ${name}`, {encoding: 'utf8'}).trim();
    return st === 'active';
  } catch { return false; }
}
for (const s of ['arcade-live', 'arcade-pattern', 'arcade-history', 'arcade-dashboard']) {
  const on = svc(s);
  check(`service:${s}`, on);
  if (!on && fix) {
    try { execSync(`systemctl try-restart ${s}`, {stdio: 'ignore'}); out.actions.push(`restarted ${s}`); }
    catch (e) { out.actions.push(`restart FAILED ${s}`); }
  }
}
// DB freshness via node:sqlite through a temp script (dash-safe, no sqlite3 CLI).
import os from 'node:os';
import path from 'node:path';
function q(db, sql) {
  try {
    const f = path.join(os.tmpdir(), `wdq-${Date.now()}-${Math.floor(Math.random()*1e6)}.mjs`);
    fs.writeFileSync(f, `import{DatabaseSync}from'node:sqlite';\nconst d=new DatabaseSync(process.argv[2],{readOnly:true});\nconsole.log(JSON.stringify(d.prepare(process.argv[3]).get()));\nd.close();\n`);
    const out = execSync(`node ${f} ${db} ${JSON.stringify(sql)}`, {encoding: 'utf8'});
    try { fs.unlinkSync(f); } catch {}
    return JSON.parse(out);
  } catch { return null; }
}
const tickAge = (() => {
  const r = q(`${LIVE}/arcade.sqlite`, 'SELECT MAX(received_ms) AS m FROM ticks');
  return r && r.m != null ? Date.now() - Number(r.m) : null;
})();
check('btc_tick_age_ms_ok', tickAge != null && tickAge < 120000, tickAge);
const roundAge = (() => {
  const r = q(`${LIVE}/arcade.sqlite`, 'SELECT MAX(end_ms) AS m FROM rounds');
  return r && r.m != null ? Date.now() - Number(r.m) : null;
})();
check('round_age_ms_ok', roundAge != null && roundAge < 600000, roundAge);
check('disk_ok', (() => {
  try {
    const df = execSync('df -B1 /data | tail -1', {encoding: 'utf8'}).split(/\s+/);
    const avail = Number(df[3]);
    return avail > 2_000_000_000;
  } catch { return false; }
})());
const backupAge = (() => {
  try {
    const files = fs.readdirSync('/data/arcade/backups').filter(f => f.endsWith('.db.gz') || f.endsWith('.db')).map(f => fs.statSync('/data/arcade/backups/' + f).mtimeMs);
    return files.length ? Date.now() - Math.max(...files) : null;
  } catch { return null; }
})();
check('backup_age_ok', backupAge != null && backupAge < 48 * 3600000, backupAge);
console.log(JSON.stringify(out, null, 2));
process.exit(out.checks.every(c => c.ok) ? 0 : 1);
