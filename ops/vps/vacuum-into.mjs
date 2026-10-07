// VACUUM INTO helper: node vacuum-into.mjs <src.db> <dest.db> (argv positions, no interpolation).
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
const [src, dest] = [process.argv[2], process.argv[3]];
if (!src || !dest || !fs.existsSync(src)) { console.error('VACUUM_USAGE'); process.exit(2); }
const s = new DatabaseSync(src);
s.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
s.close();
console.log(`vacuum-ok ${dest}`);
