import {sha,featuresAsOf,nextRound} from './market.mjs';
import {ARMS,makeRunner,actionFor} from './models.mjs';
import {makeCollector} from './collector.mjs';
import {discover} from './discovery.mjs';
import {Store} from './store.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export function buildSnapshot(round,ticks,now,cfg){
  const feature=featuresAsOf(ticks,now,cfg.maxPriceAgeMs);
  if(!feature)return null;
  return {experiment:'ARCADE_DECISIONS_V0',version:'0.1.0',market:'Jupiter Arcade BTC 1m NEXT round',
    target:{round_id:round.id,start_ms:round.startMs,end_ms:round.endMs,open_price_known:false},
    as_of_received_ms:now,feature,provenance:'JUPITER_LIVE_RECEIPT_ONLY',
    task:'Probability that future close is STRICTLY GREATER than unknown future open. Not the current round.',
    unknown:['future_open','future_close','future_round_result']};
}
export function venueLockMs(round, cfg) {
  // Verified 2026-10-07 PlayConfig: betCutoffSeconds=5 on-chain, clientDisableBuffer 0.
  // Paper deadline must be at or before venue lock, never after.
  const venueCutoff = Number(cfg.venueBetCutoffMs ?? 5000);
  return round.startMs - Math.max(cfg.bufferMs, venueCutoff + 1000);
}
export function makePaperEngine(cfg,store,modelRunner=makeRunner(cfg)) {
  const attempted=new Set();
  async function consider(round,ticks,now=Date.now()){
    if(attempted.has(round.id)||store.hasRoundDecision(round.id))return null;
    const delta=round.startMs-now;
    // Fixed prospective window. Not an opportunistic late entry.
    if(delta > cfg.beforeMs+2000 || delta < cfg.beforeMs-2000)return null;
    attempted.add(round.id);
    const snapshot=buildSnapshot(round,ticks,now,cfg);
    const deadline=venueLockMs(round,cfg);
    if(!snapshot){
      for(const arm of ARMS)store.saveDecision({roundId:round.id,arm,status:'SKIP_NO_LIVE_DATA',action:'SKIP',errorCode:'FRESHNESS_OR_COVERAGE'},cfg.stake);
      return {roundId:round.id,status:'SKIP_NO_LIVE_DATA'};
    }
    const hash=store.saveSnapshot(round.id,now,snapshot);
    const results=await Promise.all(ARMS.map(arm=>modelRunner(arm,round.id,snapshot,hash,deadline)));
    for(const d of results)store.saveDecision(d,cfg.stake);
    return {roundId:round.id,snapshotHash:hash,results:results.map(({arm,status,action,pUp,errorCode})=>({arm,status,action,pUp,errorCode}))};
  }
  return {consider};
}
export async function runLivePaper(cfg,logger=console){
  const store=new Store(cfg.dataDir);
  try {
    const audit=await discover(cfg,store);
    if(!audit.roundsInSchema)throw new Error(`BLOCKED_UNVERIFIED_ROUNDS_ROUTE:${audit.roundsPath}. See docs/01_SOURCE_DISCOVERY.md`);
    logger.info?.('OPENAPI_VERIFIED',audit.readOnlyPlayPaths.length,'read-only /play paths');
    const collector=makeCollector(cfg,store,logger);const engine=makePaperEngine(cfg,store);
    collector.start();let stop=false;
    const halt=()=>{stop=true;collector.stop();};process.once('SIGINT',halt);process.once('SIGTERM',halt);
    logger.info?.('PAPER_ONLY_STARTED — NO WALLET OR TRANSACTION CODE');
    while(!stop){
      const now=Date.now();const round=nextRound(collector.getRounds(),now);
      if(round){const result=await engine.consider(round,collector.getTicks(),now);if(result)logger.info?.('PAPER_ROUND',JSON.stringify(result));}
      await delay(450);
    }
  } finally{store.close();}
}
export function demo(cfg,roundCount=40){
  const dir=cfg.dataDir+'/demo-fixture'; const store=new Store(dir);
  const base=Date.UTC(2026,9,1);const fixtureCfg={...cfg};
  for(let i=0;i<roundCount;i++){
    const start=base+i*60000, end=start+60000;
    const id='FIXTURE_BTC_'+i;
    const open=(82000+i*0.1).toFixed(6),close=(82000+i*0.1+(i%3?1.25:-1.4)).toFixed(6);
    const round={id,startMs:start,endMs:end,openMicro:String(BigInt(Math.trunc(Number(open)*1e6))),closeMicro:String(BigInt(Math.trunc(Number(close)*1e6))),result:i%3?'UP':'DOWN',raw:{fixture:true}};
    store.round(round,end+2000);
    const snap={experiment:'FIXTURE_ONLY_NOT_LIVE',round_id:id,as_of_ms:start-10000};
    const hash=store.saveSnapshot(id,start-10000,snap);
    for(const [j,arm] of ARMS.entries()){
      // Explicitly synthetic model output. Never label as provider inference.
      const p=.5 + (i%5-2)*.09 + j*.01;
      store.saveDecision({roundId:id,arm,status:'FIXTURE_ONLY',pUp:p,action:actionFor(p,fixtureCfg),sentMs:start-10000,receivedMs:start-9950,model:'FIXTURE_NOT_ACTUAL_API',snapshotHash:hash},cfg.stake);
    }
    store.settle(id,round.result);
  }
  const stats=store.stats();store.close();return {directory:dir,notice:'SYNTHETIC DEMO ONLY. NO LIVE MODEL CALLS OR REAL JUPITER PRICES.',stats};
}
