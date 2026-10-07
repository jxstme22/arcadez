import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeTick,normalizeRound,featuresAsOf,parseMicro,extractRounds,nextRound} from '../src/market.mjs';
import {requestFor,parseAnswer,actionFor,makeRunner} from '../src/models.mjs';
import {assertSafeJupiterUrl,postJson,TRUSTED} from '../src/http.mjs';
import {Store} from '../src/store.mjs';
import {makePaperEngine} from '../src/paper.mjs';
import {inspectSpec} from '../src/discovery.mjs';
const cfg={openaiKey:'fake',typesafeKey:'fake',fastinoKey:'fake',openaiModel:'gpt-6-luna',typesafeModel:'jev-latest',fastinoModel:'fastino/GLiDE',maxPriceAgeMs:2500,beforeMs:10000,bufferMs:3000,upThreshold:.57,downThreshold:.43,stake:10,maxCalls:100,maxArmCalls:100,requestTimeoutMs:4500};
const store=()=>new Store(fs.mkdtempSync(path.join(os.tmpdir(),'arcade-test-')));

test('Jupiter read-only allowlist rejects writes and foreign hosts',()=>{
  assert.doesNotThrow(()=>assertSafeJupiterUrl('https://prediction-market-api.jup.ag/api/v1/play/rounds'));
  for (const x of ['https://prediction-market-api.jup.ag/api/v1/play/orders','https://evil.test/api/v1/play/rounds','http://prediction-market-api.jup.ag/api/v1/play/rounds']) assert.throws(()=>assertSafeJupiterUrl(x));
});
test('Jupiter get only and exact provider POST route',async()=>{
  await assert.rejects(postJson('https://evil.test/key','KEY',{},1000),/UNTRUSTED/);
});
test('parse integer micro and decimal BTC prices without float truncation',()=>{
  assert.equal(parseMicro('84200.1234567'),'84200123456');assert.equal(parseMicro('84200123456'),'84200123456');assert.equal(parseMicro('bad'),null);
});
test('round never inferred without real venue ID and start',()=>{
  assert.equal(normalizeRound({startTs:1790000000,openPrice:'84200.00'}),null);
  const r=normalizeRound({id:'btc-1',asset:'BTC',startTs:1790000000,closeTs:1790000060,openPrice:'84200.00',closePrice:'84201.00'});
  assert.equal(r?.result,'UP');assert.equal(extractRounds({rounds:[{id:'btc-1',asset:'BTC',startTs:1790000000,closeTs:1790000060}]}).length,1);
});
test('future-received tick cannot enter past snapshot even with past source time',()=>{
  const at=1790000000000;
  const t=Array.from({length:70},(_,i)=>({price:84000+i*.02,receivedMs:at-70000+i*1000,sourceMs:at-70000+i*1000,provenance:'LIVE_RECEIVED_WS'}));
  const baseline=featuresAsOf(t,at-1000);assert.ok(baseline);
  const leak={price:90000,sourceMs:at-5000,receivedMs:at+10000,provenance:'LIVE_RECEIVED_WS'};
  assert.deepEqual(featuresAsOf([...t,leak],at-1000),baseline);
});
test('stale live feed fails closed',()=>{
  const a=1790000000000;assert.equal(featuresAsOf([{price:83000,receivedMs:a-60000,sourceMs:a-60000,provenance:'LIVE_RECEIVED_WS'}],a),null);
});
test('historical backfill is not live input',()=>{
  const at=1790000000000;const ticks=Array.from({length:70},(_,i)=>({price:84000+i,receivedMs:at-69000+i*1000,sourceMs:at-69000+i*1000,provenance:'HISTORICAL_BACKFILL'}));
  assert.equal(featuresAsOf(ticks,at),null);
});
test('WebSocket tick needs BTC and non-future timestamp',()=>{
  const at=1790000000000;assert.equal(normalizeTick({symbol:'btcusdt',value:85000,timestamp:at-1000},at)?.price,85000);
  assert.equal(normalizeTick({symbol:'btcusdt',value:85000,timestamp:at+3000},at),null);
  assert.equal(normalizeTick({symbol:'solusdt',value:150,timestamp:at},at),null);
});
test('three identical semantic questions and distinct adapters',()=>{
  const snapshot={a:1};const requests=['openai','jev','glide'].map(x=>requestFor(x,snapshot,cfg));
  assert.equal(requests[0].body.questions[0].name,'next_btc_arcade_up');
  assert.equal(requests[1].body.questions.next_btc_arcade_up.type,'noul');
  assert.equal(requests[2].body.questions.next_btc_arcade_up.type,'noul');
  assert.equal(requests[2].url,TRUSTED.fastino);
});
test('provider parsing forbids missing, malformed, refusal and out-of-range probabilities',()=>{
  assert.equal(parseAnswer('openai',{answers:[{name:'next_btc_arcade_up',type:'predicate',probability:.72}]}).pUp,.72);
  assert.equal(parseAnswer('jev',{answers:{next_btc_arcade_up:{type:'noul',noul:.42}}}).pUp,.42);
  assert.equal(parseAnswer('glide',{answers:{next_btc_arcade_up:{type:'noul',noul:.12}}}).pUp,.12);
  assert.throws(()=>parseAnswer('openai',{answers:[{name:'next_btc_arcade_up',type:'refusal'}]}));
  assert.throws(()=>parseAnswer('jev',{answers:{next_btc_arcade_up:{type:'noul',noul:1.2}}}));
});
test('probability thresholds are fixed, neutral abstains',()=>{
  assert.equal(actionFor(.5,cfg),'SKIP');assert.equal(actionFor(.57,cfg),'UP');assert.equal(actionFor(.42,cfg),'DOWN');
});
test('per-round uniqueness protects against duplicate paper entries',()=>{
  const s=store();const roundId='test-round';s.saveDecision({roundId,arm:'openai',status:'OK',pUp:.66,action:'UP'},10);
  s.saveDecision({roundId,arm:'openai',status:'OK',pUp:.34,action:'DOWN'},10);
  const row=s.db.prepare('SELECT COUNT(*) AS cnt,action FROM decisions WHERE round_id=?').get(roundId);
  assert.equal(row.cnt,1);assert.equal(row.action,'UP');s.close();
});
test('no payout evidence means PnL remains NULL, including after settlement',()=>{
  const s=store();const id='r4';s.saveDecision({roundId:id,arm:'jev',status:'OK',pUp:.7,action:'UP'},10);s.settle(id,'UP');
  const p=s.db.prepare('SELECT correct,pnl_usdc,pnl_status FROM paper').get();assert.equal(p.correct,1);assert.equal(p.pnl_usdc,null);assert.match(p.pnl_status,/UNAVAILABLE/);s.close();
});
test('round selection targets NEXT round only',()=>{
  assert.equal(nextRound([{id:'a',startMs:10000},{id:'b',startMs:70000}],65000)?.id,'b');
});
test('live engine refuses missing data without spending any model tokens',async()=>{
  const s=store();let invoked=0;
  const engine=makePaperEngine(cfg,s,async()=>{invoked++;throw new Error('SHOULD_NOT_INVOKE');});
  const now=1790000000000,round={id:'r5',startMs:now+10000,endMs:now+70000};
  const result=await engine.consider(round,[],now);assert.equal(result.status,'SKIP_NO_LIVE_DATA');assert.equal(invoked,0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n,3);s.close();
});
test('live model response after deadline is ineligible',async()=>{
  const tcfg={...cfg,requestTimeoutMs:1};const runner=makeRunner(tcfg,async()=>({answers:[{type:'predicate',name:'next_btc_arcade_up',probability:.9}]}));
  const result=await runner('openai','r',{a:1},'sha',Date.now()-1);assert.equal(result.action,'SKIP');assert.equal(result.status,'MISSED_LOCK');
});
test('OpenAPI discovery limits itself to GET /play routes',()=>{
  const paths=inspectSpec({paths:{'/api/v1/play/rounds':{get:{summary:'List'},post:{}},'/api/v1/play/orders':{post:{}},'/prediction/v1/events':{get:{}}}});
  assert.deepEqual(paths.map(x=>x.path),['/api/v1/play/rounds']);
});

test('end-to-end paper arm fanout with true receive-only ticks, then settle',async()=>{
  const s=store(),now=Date.now(),round={id:'e2e_'+now,startMs:now+10000,endMs:now+70000};
  const ticks=Array.from({length:120},(_,i)=>({price:84000+i*.15,sourceMs:now-119000+i*1000,receivedMs:now-119000+i*1000,provenance:'LIVE_RECEIVED_WS',raw:{symbol:'btcusdt',price:84000+i*.15,timestamp:now-119000+i*1000}}));
  let calls=0;
  const runner=async(arm,id,snapshot,hash,deadline)=>{calls++;assert.equal(snapshot.target.round_id,id);assert.ok(deadline>now);return {roundId:id,arm,status:'OK',pUp:arm==='openai'?.72:arm==='jev'?.55:.35,action:arm==='openai'?'UP':arm==='jev'?'SKIP':'DOWN',sentMs:now,receivedMs:now+20,model:arm,snapshotHash:hash};};
  const engine=makePaperEngine(cfg,s,runner);
  const result=await engine.consider(round,ticks,now);assert.equal(calls,3);assert.equal(result.results.length,3);
  assert.equal((await engine.consider(round,ticks,now))===null,true);
  s.settle(round.id,'UP');const stats=s.stats();assert.equal(stats.arms.length,3);assert.equal(stats.arms.find(x=>x.arm==='openai').wins,1);
  s.close();
});

test('same simulated payload, strict replay parity and fixture isolation',async()=>{
  const {checkSnapshotReplay}=await import('../src/replay.mjs');
  const s=store();const now=Date.now();
  const ticks=Array.from({length:120},(_,i)=>({price:86000+i*.01,sourceMs:now-119000+i*1000,receivedMs:now-119000+i*1000,provenance:'LIVE_RECEIVED_WS',raw:{symbol:'btcusdt',price:86000+i*.01,timestamp:now-119000+i*1000}}));
  for(const t of ticks)s.tick(t);
  const {buildSnapshot}=await import('../src/paper.mjs');const round={id:'rReplay',startMs:now+10000,endMs:now+70000};
  const snap=buildSnapshot(round,ticks,now,cfg);assert.ok(snap);
  s.saveSnapshot(round.id,now,snap);
  const check=checkSnapshotReplay(s,cfg.maxPriceAgeMs);assert.equal(check.replayedLiveSnapshots,1);assert.equal(check.pass,true);s.close();
});

test('historical harvest arguments forbid unbounded, future or high-frequency default jobs',async()=>{
  const {parseHarvestArgs}=await import('../src/harvest.mjs');
  assert.deepEqual(parseHarvestArgs(['--from','2026-09-01T00:00:00Z','--to','2026-09-01T00:02:00Z','--step','60','--limit','2']).limit,2);
  assert.throws(()=>parseHarvestArgs(['--from','2026-09-01T00:00:00Z','--to','2026-10-01T00:00:00Z','--step','1','--limit','999999']));
  assert.throws(()=>parseHarvestArgs(['--from','2030-01-01T00:00:00Z','--to','2030-01-01T01:00:00Z']));
});

test('unlabeled or SOL rounds can never become BTC by default',()=>{
  assert.equal(normalizeRound({id:'round42',startTs:1790000000,closeTs:1790000060}),null);
  assert.equal(normalizeRound({id:'sol-43',asset:'SOL',startTs:1790000000,closeTs:1790000060}),null);
  assert.equal(normalizeRound({id:'btc-42',startTs:1790000000,closeTs:1790000060})?.symbol,'BTC');
});
test('out-of-order REST polling cannot erase an already official settled result',()=>{
  const s=store();const id='btc-persist',at=1790000060000;
  const r={id,startMs:1790000000000,endMs:at,openMicro:'84000000000',closeMicro:'84001000000',result:'UP',raw:{official:true}};
  s.round(r,at+5000);s.round({...r,closeMicro:null,result:null,raw:{older:true}},at+6000);
  const row=s.db.prepare('SELECT result,close_micro FROM rounds WHERE id=?').get(id);
  assert.equal(row.result,'UP');assert.equal(row.close_micro,'84001000000');s.close();
});

test('venue VOID/refund explicitly overrides numerical direction; conflicting winner fails closed',()=>{
  const base={id:'btc-999',asset:'BTC',startTs:1790000000,closeTs:1790000060,openPrice:'84000',closePrice:'84010'};
  assert.equal(normalizeRound({...base,status:'VOID'}).result,'VOID');
  assert.equal(normalizeRound({...base,winner:'DOWN'}),null);
});
test('OpenAPI fetch audit persists verified GET route without a public network request',async()=>{
  const {discover}=await import('../src/discovery.mjs');const s=store();
  const f=async()=>({ok:true,text:async()=>JSON.stringify({openapi:'3.1.0',paths:{'/api/v1/play/rounds':{get:{summary:'List Rounds'}},'/api/v1/play/bets':{post:{summary:'Write'}}}})});
  const info=await discover({...cfg,openapiUrl:'https://prediction-market-api.jup.ag/openapi.json',roundsUrl:'https://prediction-market-api.jup.ag/api/v1/play/rounds'},s,f);
  assert.equal(info.roundsInSchema,true);assert.equal(info.readOnlyPlayPaths.length,1);
  assert.equal(s.evidence('arcade.openapi.full').openapi,'3.1.0');s.close();
});
test('provider network adapter sends correct X-API-Key vs Bearer auth to exact URLs',async()=>{
  const seen=[];const f=async(url,opts)=>{seen.push({url,headers:opts.headers,method:opts.method});return {ok:true,text:async()=>JSON.stringify({ok:true})}};
  await postJson(TRUSTED.fastino,'fake-fastino',{state:'test'},200,f);
  await postJson(TRUSTED.openai,'fake-openai',{input:'test'},200,f);
  assert.equal(seen[0].headers['X-API-Key'],'fake-fastino');assert.equal(seen[0].headers.Authorization,undefined);
  assert.equal(seen[1].headers.Authorization,'Bearer fake-openai');assert.equal(seen[0].method,'POST');
});
