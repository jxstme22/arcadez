import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';

const tmp = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-ledger-')));
test('stream session lifecycle recorded', () => {
  const s = tmp();
  const id = s.beginSession('crypto-ws', 'wss://x');
  s.endSession(id, Date.now(), 10, 8, 'LIVE');
  const row = s.db.prepare('SELECT kind,frames,valid_ticks AS v FROM stream_sessions WHERE id=?').get(id);
  assert.equal(row.kind, 'crypto-ws');
  assert.equal(row.frames, 10);
  assert.equal(row.v, 8);
  s.close();
});
test('gaps recorded with reason', () => {
  const s = tmp();
  const id = s.beginSession('crypto-ws', 'wss://x');
  s.recordGap(id, 1000, 6000, 'SOURCE_JUMP');
  const g = s.db.prepare('SELECT gap_ms AS ms, reason FROM stream_gaps').get();
  assert.equal(g.ms, 5000);
  assert.equal(g.reason, 'SOURCE_JUMP');
  s.close();
});
test('raw tick ledger keeps valid, duplicate and invalid rows', () => {
  const s = tmp();
  const base = {sessionId: 's1', raw: {a: 1}, receiveMs: 1000, ingestMs: 1000, collectorVersion: 'v', schemaVersion: 's', provenance: 'LIVE_RECEIVED_WS'};
  s.saveRawTick({...base, symbol: 'BTC', price: 84000, sourceMs: 900, valid: true});
  s.saveRawTick({...base, symbol: 'BTC', price: 84000, sourceMs: 900, valid: false, duplicate: true, invalidReason: 'DUPLICATE_TS'});
  s.saveRawTick({...base, symbol: null, price: null, sourceMs: null, valid: false, invalidReason: 'SCHEMA_OR_FRESHNESS'});
  const n = s.db.prepare('SELECT COUNT(*) n FROM raw_btc_ticks').get();
  assert.equal(n.n, 3);
  const inv = s.db.prepare("SELECT COUNT(*) n FROM raw_btc_ticks WHERE valid=0").get();
  assert.equal(inv.n, 2);
  s.close();
});
