// Session-A live harvest: collector (WS ticks + rounds + pools) + trades aggregates.
// Writes ONLY to ./var/live (never var/history). Bounded minutes. No inference.
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {makeCollector} from '../src/collector.mjs';
import {makeTradesStream} from '../src/trades.mjs';
loadEnv();
const minutes = Math.min(720, Math.max(1, Number(process.argv[2] || 300)));
const cfg = {...config(), dataDir: './var/live'};
const store = new Store(cfg.dataDir);
const collector = makeCollector(cfg, store, console);
const trades = makeTradesStream(store, console);
collector.start();
trades.start();
console.log(`SESSION_A_LIVE_HARVEST ${minutes}min -> ./var/live (no inference, no transactions)`);
const t0 = Date.now();
const beat = setInterval(() => {
  const el = Math.round((Date.now()-t0)/1000);
  console.log(`HARVEST_BEAT elapsed_s=${el} ws=${collector.getWsState?.() ?? 'n/a'}`);
}, 60000);
await new Promise(r => setTimeout(r, minutes*60000));
clearInterval(beat);
collector.stop(); trades.stop();
await new Promise(r => setTimeout(r, 3000));
store.close();
console.log('HARVEST_STOPPED');
