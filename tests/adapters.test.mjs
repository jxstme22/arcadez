import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeRunner} from '../src/models.mjs';

const baseCfg = {openaiKey:'k1', typesafeKey:'k2', fastinoKey:'k3', openaiModel:'gpt-6-luna', typesafeModel:'jev-latest', fastinoModel:'fastino/GLiDE', requestTimeoutMs:4500, maxCalls:2, maxArmCalls:1, upThreshold:.57, downThreshold:.43};

test('missing key disables one arm without affecting others', async () => {
  const cfg = {...baseCfg, openaiKey:'', typesafeKey:'k', fastinoKey:'k'};
  const run = makeRunner(cfg, async()=>{throw new Error('SHOULD_NOT_CALL_MISSING');});
  const r = await run('openai','r1',{a:1},'h',Date.now()+5000);
  assert.equal(r.status, 'DISABLED_MISSING_KEY');
  assert.equal(r.action, 'SKIP');
});

test('budget caps fail closed per-arm and per-session', async () => {
  const cfg = {...baseCfg, maxCalls:1, maxArmCalls:1};
  const okReply = {answers:{next_btc_arcade_up:{type:'noul',noul:0.8}}};
  const run = makeRunner(cfg, async()=>okReply);
  const a = await run('jev','r1',{a:1},'h',Date.now()+5000);
  assert.equal(a.status, 'OK');
  const b = await run('jev','r2',{a:1},'h',Date.now()+5000);
  assert.equal(b.status, 'DISABLED_BUDGET');
  const c = await run('glide','r3',{a:1},'h',Date.now()+5000);
  assert.equal(c.status, 'DISABLED_BUDGET');
});

test('401/429/timeout map to ERROR, never to a trade', async () => {
  const run401 = makeRunner(baseCfg, async()=>{throw new Error('MODEL_HTTP_401');});
  const r1 = await run401('jev','r1',{a:1},'h',Date.now()+5000);
  assert.equal(r1.status, 'ERROR');
  assert.equal(r1.action, 'SKIP');
  assert.match(r1.errorCode, /401/);
  const run429 = makeRunner(baseCfg, async()=>{throw new Error('MODEL_HTTP_429');});
  const r2 = await run429('glide','r1',{a:1},'h',Date.now()+5000);
  assert.equal(r2.status, 'ERROR');
  assert.equal(r2.action, 'SKIP');
});

test('late reply after venue lock records LATE with SKIP action', async () => {
  const run = makeRunner(baseCfg, async()=>{
    await new Promise(r=>setTimeout(r,30));
    return {answers:{next_btc_arcade_up:{type:'noul',noul:0.95}}};
  });
  const deadline = Date.now()+10;
  const r = await run('jev','rLate',{a:1},'h',deadline);
  assert.ok(['LATE','ERROR','MISSED_LOCK'].includes(r.status));
  assert.equal(r.action, 'SKIP');
});

test('malformed probability never becomes a trade', async () => {
  const run = makeRunner(baseCfg, async()=>({answers:{next_btc_arcade_up:{type:'noul',noul:1.7}}}));
  const r = await run('jev','r1',{a:1},'h',Date.now()+5000);
  assert.equal(r.status, 'ERROR');
  assert.equal(r.action, 'SKIP');
});
