// Slow rebuild gate: runs at milestones, never auto-promotes.
// Exits 0 with NOOP until +250 valid prospective rounds exist; then records a
// V1.1 *candidate* request for offline evaluation. Never mutates V1.0.
import {NodeStore} from '../src/nodes.mjs';
import {loadEnv, config} from '../src/config.mjs';
import fs from 'node:fs';
loadEnv();
const cfg = {...config(), dataDir: process.env.LIVE_DIR || '/data/arcade/live'};
const nodes = new NodeStore(process.env.NODES_LIVE_DIR || (cfg.dataDir + '-nodes'));
const since = nodes.db.prepare("SELECT COUNT(DISTINCT round_id) n FROM pattern_predictions WHERE provenance='LIVE'").get().n;
console.log(`rebuild-gate: LIVE rounds=${since} (trigger at >=250)`);
if (since < 250) { console.log('NOOP: milestone not reached'); nodes.close(); process.exit(0); }
fs.mkdirSync('/data/arcade/pattern/checkpoints', {recursive: true});
fs.writeFileSync('/data/arcade/pattern/checkpoints/v11-candidate-request.json',
  JSON.stringify({at: new Date().toISOString(), liveRounds: since, note: 'V1.1 candidate may be built offline; V1.0 continues unchanged until validated promotion'}, null, 2));
console.log('candidate request recorded (no auto-promotion)');
nodes.close();
