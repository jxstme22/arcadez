// Shared live-DB readers for EXTERNAL runtime mode (read-only; never writes collector tables).
import {normalizeRound} from './market.mjs';
export function readLiveRounds(store, now = Date.now()) {
  try {
    return store.db.prepare('SELECT raw FROM rounds').all()
      .map(r => { try { return normalizeRound(JSON.parse(r.raw)); } catch { return null; } })
      .filter(r => r && r.endMs > now - 300000);
  } catch { return []; }
}
export function readLiveTicks(store, now = Date.now()) {
  try { return store.recentTicks(now - 125000); } catch { return []; }
}
