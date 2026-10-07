// Bounded 10-minute WS verification — writes research/ws/verification.json
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {makePriceStream} from '../src/ws.mjs';
import fs from 'node:fs';
loadEnv();
const cfg = {...config(), dataDir: './var/ws-verify'};
const store = new Store(cfg.dataDir);
const stream = makePriceStream(cfg, store, console);
const t0 = Date.now();
console.log('WS_VERIFY_START ' + new Date().toISOString());
stream.start();
// Force one reconnect at ~3 min to test resubscribe recovery.
setTimeout(() => {
  console.log('WS_VERIFY_FORCED_RECONNECT');
  try { stream.stop(); } catch {}
  setTimeout(() => { try { stream.start(); } catch {} }, 2000);
}, 180000);
setTimeout(() => {
  const m = stream.getMetrics();
  try { stream.stop(); } catch {}
  // Count SOL contamination: must be zero (normalizeTick rejects non-BTC).
  let solFrames = 0;
  try {
    const rows = store.db.prepare(`SELECT payload FROM raw_events WHERE source='JUPITER_PRICE_WS' AND kind='ws_frame'`).all();
    for (const r of rows) {
      const p = JSON.stringify(r.payload);
      if (/solusdt|ethusdt/i.test(p) && !/btcusdt/i.test(p)) solFrames++;
    }
  } catch {}
  const out = {
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
    ...m,
    solOnlyFrames: solFrames,
    gate: {minMinutes: 10, minFrames: 300},
    pass: (Date.now() - t0) >= 600000 && m.validTicks >= 300 && solFrames === 0 && m.state !== 'FAILED',
  };
  fs.mkdirSync('research/ws', {recursive: true});
  fs.writeFileSync('research/ws/verification.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  store.close();
  process.exit(out.pass ? 0 : 2);
}, 620000);
