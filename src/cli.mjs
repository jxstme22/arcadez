import {loadEnv,config} from './config.mjs';
import {Store} from './store.mjs';
import {discover} from './discovery.mjs';
import {runLivePaper,demo} from './paper.mjs';
import {serve} from './dashboard.mjs';
import {makeCollector} from './collector.mjs';
import {harvest,parseHarvestArgs} from './harvest.mjs';
import {checkSnapshotReplay} from './replay.mjs';
loadEnv();const cfg=config();const cmd=process.argv[2]||'help';
function keys(){return {OpenAI:!!cfg.openaiKey,Jev:!!cfg.typesafeKey,GLiDE:!!cfg.fastinoKey};}
const doctor=()=>{let ws=null,payout=null;try{const s=new Store(cfg.dataDir);ws=s.evidence('arcade.ws.state');try{const h=s.db.prepare('SELECT state,frames,valid_ticks AS validTicks FROM ws_health ORDER BY id DESC LIMIT 1').get(); if(h) ws={...ws,...h};}catch{} payout={grossFormula:'totalPool/winningPool (1.0 if empty, null if one-sided)', netFactor:0.99, feeBps:100, status:'FRONTEND_FORMULA_REPRODUCED_ONCHAIN_FEE_UNVERIFIED_PNL_NULL'};s.close();}catch{} console.log(JSON.stringify({node:process.version,mode:'READ_ONLY_PAPER',symbol:'BTC',modelKeysPresent:keys(),
  dataDir:cfg.dataDir,roundsUrl:cfg.roundsUrl,priceWsUrl:cfg.wsUrl,wsSubscribe:{type:'subscribe',symbols:['btcusdt']},ws,payout,notes:['No provider keys printed','Paper PnL NULL until on-chain fee proof (feeAmount semantics unverified)','WS verified 2026-10-07: snapshot + ~1Hz btcusdt ticks']},null,2));};
try{
  if(cmd==='doctor')doctor();
  else if(cmd==='discover'){const store=new Store(cfg.dataDir);try{console.log(JSON.stringify(await discover(cfg,store),null,2));}finally{store.close();}}
  else if(cmd==='paper'){doctor();await runLivePaper(cfg);}
  else if(cmd==='demo'){const n=Math.min(200,Math.max(1,Number(process.argv[3]||40)));console.log(JSON.stringify(demo(cfg,n),null,2));}
  else if(cmd==='report'){const s=new Store(cfg.dataDir);console.log(JSON.stringify(s.stats(),null,2));s.close();}
  else if(cmd==='dashboard'){serve(cfg);}
  else if(cmd==='capture'){const minutes=Number(process.argv[3]||30);if(!Number.isFinite(minutes)||minutes<=0||minutes>720)throw Error('CAPTURE_MINUTES_MUST_BE_1_TO_720');const s=new Store(cfg.dataDir);const c=makeCollector(cfg,s);c.start();console.log('READ_ONLY_RAW_CAPTURE_STARTED for '+minutes+' minutes. No inference, no transactions.');await new Promise(r=>setTimeout(r,minutes*60000));c.stop();await new Promise(r=>setTimeout(r,Math.max(2100,cfg.restPollMs+300)));s.close();console.log('CAPTURE_STOPPED');}
  else if(cmd==='harvest'){const params=parseHarvestArgs(process.argv.slice(3));const s=new Store(cfg.dataDir);try{console.log(JSON.stringify(await harvest(cfg,s,params),null,2));}finally{s.close();}}
  else if(cmd==='harvest:status'){const {statusReport}=await import('./status.mjs');console.log(JSON.stringify(statusReport(cfg),null,2));}
  else if(cmd==='replay'){const s=new Store(cfg.dataDir);const v=checkSnapshotReplay(s,cfg.maxPriceAgeMs);s.close();console.log(JSON.stringify(v,null,2));if(!v.pass)process.exitCode=1;}
  else console.log('Usage: npm run doctor | discover | paper | demo | dashboard | report | replay | capture [minutes] | harvest --from ISO --to ISO --step N --limit N');
}catch(e){console.error('BLOCKED:',String(e?.message||e));process.exitCode=1;}
