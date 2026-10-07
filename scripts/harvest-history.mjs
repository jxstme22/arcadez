// Bounded historical harvest — Jupiter-only, read-only GETs.
// Window: [now-2h15m, now-15m] (excludes live edge; never enters live feature path).
// Rounds -> historical_rounds (VENUE_RECORDED); prices -> historical_prices (HISTORICAL_BACKFILL).
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {getJson} from '../src/http.mjs';
import {normalizeRound} from '../src/market.mjs';
import {harvest} from '../src/harvest.mjs';
import fs from 'node:fs';
loadEnv();
const cfg = {...config(), dataDir: process.env.HISTORY_DIR || './var/history'};
const store = new Store(cfg.dataDir);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = Date.now();
// Env-overridable window (minutes back). Defaults preserve the original 2h15m..15m window.
// Round retention is ~(18h,24h]; price floor ~(28d,30d]. Keep windows inside retention.
const toBackMin = Math.max(5, Number(process.env.HIST_TO_MIN ?? 15));
const spanMin = Math.min(720, Math.max(10, Number(process.env.HIST_SPAN_MIN ?? 120)));
const to = new Date(now - toBackMin*60000);
const from = new Date(now - (toBackMin+spanMin)*60000);
console.log(`HISTORY_HARVEST ${from.toISOString()} .. ${to.toISOString()}`);
let roundsOk = 0, roundsMiss = 0;
const secSeen = new Set();
const missing = [];
for (let ms = from.getTime(); ms < to.getTime(); ms += 60000) {
  const sec = Math.floor(ms/60000)*60; // venue openTs grid is minute-aligned; off-grid secs 404
  if (secSeen.has(sec)) continue; secSeen.add(sec);
  try {
    const raw = await getJson(`https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/${sec}`, 10000, fetch);
    const r = normalizeRound(raw);
    if (r && (r.result === 'UP' || r.result === 'DOWN' || r.result === 'VOID')) {
      store.saveHistoricalRound(r, 'VENUE_RECORDED', Date.now());
      store.raw('JUPITER_HISTORY', 'historical_round', r.startMs, Date.now(), raw);
      roundsOk++;
    } else { roundsMiss++; missing.push(sec); }
  } catch (e) { roundsMiss++; missing.push(sec); if (/429|403/.test(String(e?.message))) { console.log('RATE_OR_ACCESS_BLOCKED_STOP'); break; } }
  await sleep(2100);
}
console.log(`rounds ok=${roundsOk} miss=${roundsMiss}`);
const priceRes = await harvest(cfg, store, {from: from.getTime(), to: to.getTime(), step: 60, limit: 720}, getJson, console);
const manifestPath = process.env.HIST_MANIFEST ?? 'research/history/manifest.json';
const manifest = {capturedAt: new Date().toISOString(), window: {from: from.toISOString(), to: to.toISOString()},
  rounds: {ok: roundsOk, missing: roundsMiss, missingSample: missing.slice(0,20), provenance: 'VENUE_RECORDED', note: 'Labels from venue open/close micro + outcome; no invented rounds.'},
  prices: {...priceRes, provenance: 'HISTORICAL_BACKFILL_NEVER_LIVE'},
  totals: 'see `npm run harvest:status` (store is source of truth across passes)'};
fs.mkdirSync('research/history', {recursive:true});
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({roundsOk, roundsMiss, pricesOk: priceRes.ok, pricesFailed: priceRes.failed}));
store.close();
