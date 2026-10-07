import {getJson,assertSafeWs,assertSafeJupiterUrl} from './http.mjs';
import {extractRounds,normalizeTick} from './market.mjs';
import {makePriceStream} from './ws.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function makeCollector(cfg,store,logger=console){
  let stopped=false;let recent=[];let rounds=[];let reconnected=0;
  const stream = makePriceStream(cfg, store, logger);
  const onRound=(r)=>{store.round(r);if(r.upPoolMicro!=null||r.downPoolMicro!=null){try{store.poolObservation(r);}catch{}}try{store.observeRoundState(r);}catch{}rounds=Array.from(new Map([...rounds,r].map(x=>[x.id,x])).values()).filter(x=>x.endMs>Date.now()-300000);};
  function noteServerTime(v){
    const st = v?.serverTime ?? v?.server_time;
    if (Number.isFinite(Number(st))) {
      const serverMs = Number(st) < 1e11 ? Number(st)*1000 : Number(st);
      const drift = Date.now()-serverMs;
      if (Math.abs(drift) > 15000) logger.warn?.('SOURCE_CLOCK_DRIFT_MS', Math.round(drift));
      try{store.saveEvidence('arcade.clock.last',{serverMs,localMs:Date.now(),driftMs:Math.round(drift),at:new Date().toISOString()});}catch{}
    }
  }
  async function pollOnce(url){
    const v=await getJson(url);
    store.raw('JUPITER_ARCADE','rounds_response',null,Date.now(),{url,body:v});
    noteServerTime(v);
    const arr=extractRounds(v);
    if(!arr.length)logger.warn('ROUNDS_UNRECOGNIZED_SCHEMA: saved raw payload, no forecasts permitted');
    for(const x of arr)onRound(x);
    return arr.length;
  }
  async function pollRounds(){
    assertSafeJupiterUrl(cfg.roundsUrl);
    if(cfg.roundsCurrentUrl) assertSafeJupiterUrl(cfg.roundsCurrentUrl);
    while(!stopped){
      try{
        // Verified 2026-10-07: timeline requires ?asset=BTC&before=&after= ; current gives live+bettable.
        await pollOnce(cfg.roundsCurrentUrl || cfg.roundsUrl);
      }catch(e){logger.warn('ROUND_POLL_ERR',String(e.message));}
      await sleep(Math.max(1000,Math.floor(cfg.restPollMs/2)));
      if(stopped) break;
      try{ await pollOnce(cfg.roundsUrl); }catch(e){logger.warn('ROUND_POLL_ERR',String(e.message));}
      await sleep(Math.max(1000,Math.floor(cfg.restPollMs/2)));
    }
  }
  async function priceWs(){
    // Verified 2026-10-07: subscribe {type:'subscribe',symbols:['btcusdt']} yields snapshot + ~1Hz ticks.
    // Delegates to production-safe stream adapter with lifecycle states and gap tracking.
    stream.start();
    while(!stopped){ await sleep(5000); }
  }
  return { start(){void pollRounds();void priceWs();},stop(){stopped=true;try{stream.stop();}catch{}},getRounds(){return rounds.slice();},getTicks(){try{return store.recentTicks(Date.now()-125000);}catch{return recent.slice();}},injectRound:onRound,
    getWsState:()=>stream.getState(), getWsMetrics:()=>stream.getMetrics(),
    injectTick(t){store.tick(t);recent.push(t);recent=recent.filter(y=>y.receivedMs>=Date.now()-125000);}};
}
