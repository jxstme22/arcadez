// Overlap export: JSON summary for cross-host comparison (read-only).
import {Store} from '../src/store.mjs';
import {loadEnv, config} from '../src/config.mjs';
loadEnv();
const cfg = {...config(), dataDir: process.env.LIVE_DIR || './var/live'};
const s = new Store(cfg.dataDir);
const sinceMin = Number(process.env.SINCE_MIN || 45);
const since = Date.now() - sinceMin*60000;
const rounds = s.db.prepare('SELECT id,start_ms AS startMs,end_ms AS endMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM rounds WHERE end_ms >= ? ORDER BY start_ms').all(since)
  .map(r => { let v = {}; try { v = JSON.parse(r.raw || '{}'); } catch {} return {id: r.id, startMs: r.startMs, result: r.result, upPool: v.upPool ?? null, downPool: v.downPool ?? null}; });
const ticks = s.db.prepare('SELECT COUNT(*) n, MIN(source_ms) mn, MAX(source_ms) mx FROM ticks WHERE received_ms >= ?').get(since);
const bars = (() => { try { return s.db.prepare('SELECT COUNT(*) n FROM trade_minute_bars').get().n; } catch { return null; } })();
const gaps = (() => { try { return s.db.prepare('SELECT COUNT(*) n, COALESCE(MAX(gap_ms),0) mx FROM stream_gaps').all(); } catch { return null; } })();
console.log(JSON.stringify({at: new Date().toISOString(), dir: cfg.dataDir, rounds, ticks, tradeBars: bars, gaps}));
s.close();
