// Frozen checkpoint resolver: verifies SHA256 against the committed manifest and
// returns a verified path. Uses whichever copy verifies (var/ working copy or
// research/ vendored copy). Throws if none verifies — tests must fail closed,
// never silently run against wrong data.
import fs from 'node:fs';
import crypto from 'node:crypto';
const MANIFEST = {v1: 'research/pattern-lab/v1/source-manifest.json', v2: 'research/pattern-lab/v2/source-manifest.json'};
const CANDIDATES = {
  v1: ['var/pattern-lab/v1/source/history-checkpoint.db', 'research/pattern-lab/v1/source/history-checkpoint.db'],
  v2: ['var/pattern-lab/v2/source/history-checkpoint.db', 'research/pattern-lab/v2/source/history-checkpoint.db'],
};
const SPLIT_CANDIDATES = {
  v1: ['var/pattern-lab/v1/splits', 'research/pattern-lab/v1/splits'],
  v2: ['var/pattern-lab/v2/r/splits', 'research/pattern-lab/v2/splits'],
};
export function checkpointPath(version = 'v2') {
  const man = JSON.parse(fs.readFileSync(MANIFEST[version], 'utf8'));
  for (const p of CANDIDATES[version]) {
    try {
      const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      if (h === man.sha256) return p;
    } catch {}
  }
  throw new Error(`NO_VERIFIED_CHECKPOINT_${version.toUpperCase()} (expected sha ${man.sha256.slice(0,16)}…)`);
}
export function splitsDir(version = 'v2') {
  for (const d of SPLIT_CANDIDATES[version]) {
    try {
      const m = JSON.parse(fs.readFileSync(d + '/split-manifest.json', 'utf8'));
      if (m && typeof m.n === 'number') return d;
    } catch {}
  }
  throw new Error(`NO_SPLITS_${version.toUpperCase()}`);
}
