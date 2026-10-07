// Pattern Nodes store — separate DB (var/pattern-nodes/nodes.db). Append-only observations.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {sha} from './market.mjs';
export const NODE_SCHEMA_VERSION = 'nodes-v1-20261007';
export class NodeStore {
  constructor(dir) {
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    this.dir = dir;
    this.db = new DatabaseSync(path.join(dir, 'nodes.db'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS observation_nodes(node_id TEXT PRIMARY KEY, round_id TEXT NOT NULL UNIQUE,
      open_ts INTEGER NOT NULL, close_ts INTEGER NOT NULL, features TEXT NOT NULL, outcome TEXT NOT NULL,
      move_bps REAL, quality TEXT NOT NULL, provenance TEXT NOT NULL, schema_version TEXT NOT NULL,
      created_ms INTEGER NOT NULL, sha TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_obs_open ON observation_nodes(open_ts);
    CREATE TABLE IF NOT EXISTS pattern_nodes(pattern_id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1,
      kind TEXT NOT NULL, definition TEXT NOT NULL, centroid TEXT,
      support_total INTEGER NOT NULL DEFAULT 0, up_total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE_CANDIDATE', created_ms INTEGER NOT NULL, sha TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS node_pattern_membership(obs_node_id TEXT NOT NULL, pattern_id TEXT NOT NULL,
      distance REAL, PRIMARY KEY(obs_node_id, pattern_id));
    CREATE TABLE IF NOT EXISTS novelty_buffer(node_id TEXT PRIMARY KEY, added_ms INTEGER NOT NULL, reason TEXT);
    CREATE TABLE IF NOT EXISTS pattern_predictions(pred_id INTEGER PRIMARY KEY AUTOINCREMENT, round_id TEXT NOT NULL,
      arm TEXT NOT NULL, snapshot_id TEXT NOT NULL, pattern_id TEXT, p_up REAL, action TEXT NOT NULL,
      watermark_ms INTEGER NOT NULL, frozen_ms INTEGER NOT NULL, provenance TEXT NOT NULL DEFAULT 'REPLAY',
      UNIQUE(round_id, arm));
    CREATE TABLE IF NOT EXISTS prediction_results(round_id TEXT NOT NULL, arm TEXT NOT NULL, correct INTEGER,
      venue_result TEXT, scored_ms INTEGER NOT NULL, PRIMARY KEY(round_id, arm));
    CREATE TABLE IF NOT EXISTS runtime_watermarks(key TEXT PRIMARY KEY, ms INTEGER NOT NULL, note TEXT);
    CREATE TABLE IF NOT EXISTS library_versions(version TEXT PRIMARY KEY, created_ms INTEGER NOT NULL, spec TEXT NOT NULL, sha TEXT NOT NULL);`);
  }
  insertObservation(o) {
    const payload = JSON.stringify({r: o.roundId, f: o.features, o: o.outcome});
    const sv = o.schemaVersion || NODE_SCHEMA_VERSION;
    this.db.prepare(`INSERT OR IGNORE INTO observation_nodes(node_id,round_id,open_ts,close_ts,features,outcome,move_bps,quality,provenance,schema_version,created_ms,sha)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.nodeId, o.roundId, o.openTs, o.closeTs, JSON.stringify(o.features),
      o.outcome, o.moveBps ?? null, JSON.stringify(o.quality ?? {}), o.provenance, sv, Date.now(), sha(payload));
    return this.db.prepare('SELECT changes() c').get().c === 1;
  }
  upsertPattern(p) {
    const def = JSON.stringify(p.definition), cent = p.centroid ? JSON.stringify(p.centroid) : null;
    this.db.prepare(`INSERT INTO pattern_nodes(pattern_id,version,kind,definition,centroid,support_total,up_total,status,created_ms,sha)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(pattern_id) DO UPDATE SET version=excluded.version, definition=excluded.definition,
      centroid=excluded.centroid, status=excluded.status`).run(p.patternId, p.version ?? 1, p.kind, def, cent,
      p.supportTotal ?? 0, p.upTotal ?? 0, p.status ?? 'ACTIVE_CANDIDATE', Date.now(), sha(def));
  }
  addSupport(patternId, won) {
    this.db.prepare(`UPDATE pattern_nodes SET support_total=support_total+1, up_total=up_total+? WHERE pattern_id=?`).run(won ? 1 : 0, patternId);
  }
  setWatermark(key, ms, note = null) {
    this.db.prepare('INSERT OR REPLACE INTO runtime_watermarks(key,ms,note) VALUES(?,?,?)').run(key, ms, note);
  }
  getWatermark(key) { return this.db.prepare('SELECT ms FROM runtime_watermarks WHERE key=?').get(key)?.ms ?? null; }
  close() { this.db.close(); }
}
