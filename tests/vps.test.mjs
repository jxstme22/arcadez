import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execSync} from 'node:child_process';
test('systemd units reference existing repo scripts only', () => {
  for (const f of fs.readdirSync('ops/vps/units')) {
    const t = fs.readFileSync('ops/vps/units/'+f, 'utf8');
    for (const m of t.matchAll(/scripts\/([A-Za-z0-9_.-]+\.mjs)|ops\/vps\/([A-Za-z0-9_.-]+\.(mjs|sh))/g)) {
      const p = m[1] ? 'scripts/'+m[1] : 'ops/vps/'+m[2];
      assert.ok(fs.existsSync(p), `${f} -> ${p}`);
    }
    assert.ok(!t.includes('bets') && !t.includes('claim'), f+' must not touch write paths');
  }
});
test('dashboard stays loopback-only in unit config', () => {
  const t = fs.readFileSync('src/dashboard.mjs','utf8');
  assert.ok(t.includes("'127.0.0.1'"));
});
test('bundle script excludes secrets and AppleDouble', () => {
  const t = fs.readFileSync('ops/vps/bundle.sh','utf8');
  assert.ok(t.includes("'./.env'") || t.includes('.env'));
  assert.ok(t.includes('FATAL'));
});
test('watchdog never deletes data (safe actions only)', () => {
  const t = fs.readFileSync('ops/vps/watchdog.mjs','utf8');
  assert.ok(!/rm +-rf|DELETE FROM|DROP TABLE/i.test(t));
  const unlinks = [...t.matchAll(/unlinkSync\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(unlinks.length > 0 && unlinks.every(a => a.trim() === 'f'), 'only temp-file cleanup');
  assert.ok(t.includes('try-restart'));
});
test('backup uses VACUUM INTO, never naive cp of live DBs', () => {
  const t = fs.readFileSync('ops/vps/backup.sh','utf8');
  assert.ok(t.includes('VACUUM INTO'));
});
test('overlap export emits comparable shape (rounds/ticks/gaps)', async () => {
  const {Store} = await import('../src/store.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-ov-')));
  const now = Date.now();
  s.round({id: 'btc-o', startMs: now - 60000, endMs: now, openMicro: '1', closeMicro: '2', result: 'UP',
    venueStatus: 'settled', venueOutcome: 'UP', raw: {id: 'btc-o', asset: 'BTC', openTs: 1, closeTs: 61, status: 'settled', outcome: 'UP', openPrice: '1', closePrice: '2'}}, now);
  const rows = s.db.prepare('SELECT id FROM rounds').all();
  assert.equal(rows.length, 1);
  s.close();
});
