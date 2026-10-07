import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeFrame, SYMBOL} from '../src/ws.mjs';
import {computeGrossMultiplier, computeNetPayout, computePaperPnL} from '../src/payout.mjs';
import {normalizeTick} from '../src/market.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../research/ws/fixtures/snapshot-subscribed-ticks-20261007.json', import.meta.url)));
test('ws fixture decodes snapshot + subscribed + live ticks', () => {
  assert.ok(fixture.frames.length >= 3);
  const snap = decodeFrame(fixture.frames[0].data);
  assert.equal(snap.kind, 'snapshot');
  assert.ok(snap.ticks.length >= 100);
  assert.equal(decodeFrame(fixture.frames[1].data).kind, 'subscribed');
  const tick = fixture.frames[2].data;
  assert.equal(tick.symbol, 'btcusdt');
  assert.ok(tick.value > 1000 && tick.timestamp > 1e12);
});
test('live tick normalizes with source/receive timestamps; SOL rejected', () => {
  const at = Date.now();
  const t = normalizeTick({symbol:'btcusdt', value:84065.87, timestamp: at - 500}, at);
  assert.equal(t.symbol, 'BTC');
  assert.equal(t.provenance, 'LIVE_RECEIVED_WS');
  assert.equal(normalizeTick({symbol:'solusdt', value:150, timestamp: at}, at), null);
  assert.equal(normalizeTick({symbol:'btcusdt', value:84065.87, timestamp: at + 5000}, at), null);
  assert.equal(normalizeTick({symbol:'btcusdt', timestamp: at}, at), null);
});
test('decode handles control and malformed without throwing', () => {
  assert.equal(decodeFrame({type:'subscribed', symbols:['btcusdt']}).kind, 'subscribed');
  assert.equal(decodeFrame({type:'error', error:'upstream_connect_failed'}).kind, 'error');
  assert.equal(decodeFrame({garbage:1}).kind, 'malformed');
  assert.equal(decodeFrame([{symbol:'btcusdt', value:1, timestamp:1}]).kind, 'batch');
  assert.equal(SYMBOL, 'btcusdt');
});
test('gross multiplier matches frontend formula', () => {
  assert.equal(computeGrossMultiplier({upPool:'65420000', downPool:'52000000'}, 'UP').multiplier, 117420000/65420000);
  assert.equal(computeGrossMultiplier({upPool:'0', downPool:'52000000'}, 'UP').multiplier, null);
  assert.equal(computeGrossMultiplier({upPool:'0', downPool:'0'}, 'UP').multiplier, 1);
});
test('net payout applies 0.99 fee factor; paper PnL conservative floor', () => {
  const r = computeNetPayout({upPool:'65420000', downPool:'52000000', stakeMicro:'10000000', side:'UP'});
  assert.ok(r.payoutMicro != null && BigInt(r.payoutMicro) > 10000000n);
  const expected = BigInt(Math.floor(10000000 * (117420000/65420000))) * 9900n / 10000n;
  assert.equal(r.payoutMicro, expected.toString());
  const pnl = computePaperPnL({stakeMicro:'10000000', payoutMicro: r.payoutMicro, won:true});
  assert.equal(pnl.pnlMicro, (BigInt(r.payoutMicro)-10000000n).toString());
  assert.match(pnl.reason, /UNVERIFIED/);
  assert.equal(computePaperPnL({stakeMicro:'10000000', payoutMicro:null, won:true}).pnlMicro, null);
});
test('one-sided and void stay null, never a payout', () => {
  assert.equal(computeNetPayout({upPool:'0', downPool:'0', stakeMicro:'10000000', side:'UP'}).payoutMicro, null);
});
