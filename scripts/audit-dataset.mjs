// Dataset quality audit — read-only. Exits 0 pass, 1 findings.
import {Store} from '../src/store.mjs';
import {loadEnv, config} from '../src/config.mjs';
import fs from 'node:fs';
loadEnv();
const dir = process.argv[2] || config().dataDir + '/history';
const store = new Store(dir);
const findings = [];
const check = (name, rows) => { if (rows?.length) findings.push({check: name, count: rows.length, sample: rows.slice(0,5)}); };
// 1. duplicate tick source timestamps (same source, non-duplicate-flagged duplicates are ok if flagged; look for unflagged exact dup rows)
check('dup_raw_ticks', store.db.prepare(`SELECT source_ts_ms, COUNT(*) c FROM raw_btc_ticks WHERE valid=1 AND duplicate=0 GROUP BY source_ts_ms HAVING c>1`).all());
// 2. time reversal in accepted ticks
check('time_reversal', store.db.prepare(`SELECT id, source_ts_ms FROM (SELECT id, source_ts_ms, LAG(source_ts_ms) OVER (ORDER BY id) AS prev FROM raw_btc_ticks WHERE valid=1) WHERE prev IS NOT NULL AND source_ts_ms < prev LIMIT 5`).all());
// 3. non-BTC symbols in raw ticks
check('wrong_asset', store.db.prepare(`SELECT DISTINCT symbol FROM raw_btc_ticks WHERE symbol IS NOT NULL AND symbol != 'BTC'`).all());
// 4. future source timestamps (> now+60s tolerance at audit time)
check('future_ts', store.db.prepare(`SELECT COUNT(*) n FROM raw_btc_ticks WHERE source_ts_ms > ?`).get(Date.now()+60000).n > 0 ? [{n: 1}] : []);
// 5. label mismatch in historical rounds (venue outcome vs micro direction)
{
  const rows = store.db.prepare(`SELECT id, open_micro, close_micro, result FROM historical_rounds WHERE result IN ('UP','DOWN')`).all();
  const bad = rows.filter(r => {
    try {
      const o = BigInt(r.open_micro), c = BigInt(r.close_micro);
      const dir = c > o ? 'UP' : c < o ? 'DOWN' : 'VOID';
      return dir !== r.result;
    } catch { return true; }
  });
  check('label_mismatch', bad);
}
// 6. provenance mixing: live tables must be empty in history store and vice versa (checked externally)
check('live_ticks_in_history_store', store.db.prepare(`SELECT COUNT(*) n FROM ticks`).get().n > 0 ? [{leak: true}] : []);
// 7. round id reuse with different boundaries
check('round_id_reuse', store.db.prepare(`SELECT id, COUNT(DISTINCT start_ms) d FROM historical_rounds GROUP BY id HAVING d>1`).all());
// 8. VOID equality flat closes labeled non-VOID
check('flat_nonvoid', store.db.prepare(`SELECT id FROM historical_rounds WHERE open_micro=close_micro AND result IN ('UP','DOWN') LIMIT 5`).all());
const out = {at: new Date().toISOString(), dir, findings, pass: findings.length === 0};
console.log(JSON.stringify(out, null, 2));
store.close();
process.exit(out.pass ? 0 : 1);
