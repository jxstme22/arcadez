// Collector daemon: runs Jupiter collector until SIGTERM (systemd supervised).
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {makeCollector} from '../src/collector.mjs';
import {makeTradesStream} from '../src/trades.mjs';
loadEnv();
const cfg = {...config(), dataDir: process.env.LIVE_DIR || './var/live'};
const store = new Store(cfg.dataDir);
const collector = makeCollector(cfg, store, console);
const trades = makeTradesStream(store, console);
collector.start();
trades.start();
console.log(`COLLECTOR_DAEMON dir=${cfg.dataDir} (no inference, no transactions)`);
let stop = false;
const halt = () => { if (stop) return; stop = true; collector.stop(); trades.stop(); setTimeout(() => { store.close(); console.log('COLLECTOR_STOPPED'); process.exit(0); }, 3000); };
process.once('SIGINT', halt); process.once('SIGTERM', halt);
await new Promise(() => {});
