import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {decodeTradeFrame, redactTrade, bucketMinute} from '../src/trades.mjs';
import {assertSafeWs} from '../src/http.mjs';
import {Store} from '../src/store.mjs';

const sample = {type:'trade', id:'abc:0', asset:'BTC', roundAddress:'R', owner:'O', side:'UP', amount:'44000000', timestamp:1791360903, signature:'S'};
test('trade decoder strips bettor PII, keeps aggregate fields', () => {
  const t = redactTrade(sample);
  assert.equal(t.asset, 'BTC');
  assert.equal(t.side, 'UP');
  assert.equal(t.amountMicro, '44000000');
  assert.equal(t.tsMs, 1791360903000);
  assert.ok(!('owner' in t) && !('signature' in t) && !('roundAddress' in t));
  assert.equal(t.idHash.length, 64);
  assert.equal(redactTrade({...sample, asset:'ETH'}), null);
  assert.equal(redactTrade({...sample, side:'MAYBE'}), null);
  assert.equal(redactTrade(null), null);
});
test('snapshot decodes to redacted list; unknown control safe', () => {
  const d = decodeTradeFrame({type:'snapshot', trades:[sample, {...sample, asset:'SOL', side:'DOWN'}]});
  assert.equal(d.kind, 'snapshot');
  assert.equal(d.trades.length, 2);
  assert.equal(decodeTradeFrame({type:'subscribed'}).kind, 'control');
  assert.equal(decodeTradeFrame({garbage:1}).kind, 'malformed');
});
test('allowlist permits trades WS, still rejects others', () => {
  assert.doesNotThrow(() => assertSafeWs('wss://prediction-market-price-service.fly.dev/ws/play/trades'));
  assert.throws(() => assertSafeWs('wss://prediction-market-price-service.fly.dev/ws/evil'));
  assert.throws(() => assertSafeWs('wss://evil.test/ws/crypto'));
});
test('minute bars aggregate without round linkage or PII', async () => {
  const {makeTradesStream} = await import('../src/trades.mjs');
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(),'arcade-trades-')));
  const stream = makeTradesStream(s);
  const n = stream.saveBatch([redactTrade(sample), redactTrade({...sample, side:'DOWN', amount:'1000000'})].filter(Boolean), Date.now());
  assert.equal(n, 1);
  const row = s.db.prepare('SELECT up_count,down_count,up_stake_micro,down_stake_micro FROM trade_minute_bars').get();
  assert.equal(row.up_count, 1);
  assert.equal(row.down_count, 1);
  const raw = s.db.prepare("SELECT payload FROM raw_events WHERE source='JUPITER_PLAY_TRADES'").all().map(r=>r.payload).join('');
  assert.ok(!raw.includes('"owner"'));
  s.close();
});
test('minute bucketing is deterministic', () => {
  assert.equal(bucketMinute(1791360903000), Math.floor(1791360903000/60000)*60000);
});
