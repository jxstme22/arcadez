// Read-only inventory across live + history stores (H15). No writes, no inference.
import fs from 'node:fs';
import {Store} from './store.mjs';
function inv(dir) {
  try {
    const s = new Store(dir);
    const q = (sql, args = []) => { try { return s.db.prepare(sql).get(...args); } catch { return null; } };
    const out = {
      dir, rounds: q('SELECT COUNT(*) n FROM rounds')?.n ?? null,
      ticks: q('SELECT COUNT(*) n FROM ticks')?.n ?? null,
      rawTicks: q('SELECT COUNT(*) n FROM raw_btc_ticks')?.n ?? null,
      sessions: q('SELECT COUNT(*) n FROM stream_sessions')?.n ?? null,
      gaps: q('SELECT COUNT(*) n FROM stream_gaps')?.n ?? null,
      poolObs: q('SELECT COUNT(*) n FROM pool_observations')?.n ?? null,
      stateObs: q('SELECT COUNT(*) n FROM round_state_observations')?.n ?? null,
      tradeBars: q('SELECT COUNT(*) n FROM trade_minute_bars')?.n ?? null,
      histRounds: q('SELECT COUNT(*) n FROM historical_rounds')?.n ?? null,
      histPrices: q('SELECT COUNT(*) n FROM historical_prices')?.n ?? null,
      lastTick: q('SELECT MAX(received_ms) m FROM ticks')?.m ?? null,
      lastRound: q('SELECT MAX(end_ms) m FROM rounds')?.m ?? null,
    };
    s.close();
    return out;
  } catch (e) { return {dir, error: String(e.message)}; }
}
function du(dir) {
  try {
    let b = 0;
    for (const f of fs.readdirSync(dir)) { try { b += fs.statSync(dir + '/' + f).size; } catch {} }
    return b;
  } catch { return null; }
}
export function statusReport(cfg) {
  return {at: new Date().toISOString(), live: inv(cfg.dataDir), history: inv(cfg.dataDir + '/history'),
    diskBytes: {live: du(cfg.dataDir), history: du(cfg.dataDir + '/history')}};
}
