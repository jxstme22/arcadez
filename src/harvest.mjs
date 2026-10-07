import {getJson} from './http.mjs';
import {sha,parseEpochMs} from './market.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function parseHarvestArgs(args){
  const o={step:60,limit:240};
  for(let i=0;i<args.length;i++){
    const k=args[i];if(!['--from','--to','--step','--limit'].includes(k))throw new Error('HARVEST_USAGE');
    if(i+1===args.length)throw new Error('HARVEST_USAGE');
    o[k.slice(2)]=args[++i];
  }
  const from=Date.parse(o.from||''),to=Date.parse(o.to||'');const step=Number(o.step),limit=Number(o.limit);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to>Date.now()-15000||!Number.isInteger(step)||step<1||step>3600||!Number.isInteger(limit)||limit<1||limit>5000||Math.ceil((to-from)/(step*1000))>limit)throw new Error('HARVEST_UNSAFE_ARGS');
  return {from,to,step,limit};
}
export async function harvest(cfg,store,params,call=getJson,log=console){
  // Bounded GET research only; never insert into live tick table.
  let ok=0,failed=0;const errors=[];
  store.db.exec(`CREATE TABLE IF NOT EXISTS historical_prices(source_ts_ms INTEGER PRIMARY KEY,
    queried_at_ms INTEGER NOT NULL,received_at_ms INTEGER NOT NULL,price_usd REAL NOT NULL,raw_sha TEXT NOT NULL,
    provenance TEXT NOT NULL CHECK(provenance='HISTORICAL_BACKFILL'));`);
  for(let ms=params.from;ms<params.to;ms+=params.step*1000){
    const sec=Math.floor(ms/1000);
    const url=`https://prediction-market-price-service.fly.dev/price/crypto/btcusdt?timestamp=${sec}`;
    const queried=Date.now();
    try{
      const result=await call(url,5000);const received=Date.now();
      if(result?.symbol?.toLowerCase()!=='btcusdt'||Number(result?.timestamp)!==sec*1000 ||!Number.isFinite(Number(result?.value)) ||Number(result.value)<1000)throw new Error('INVALID_PRICE_RESPONSE');
      store.raw('JUPITER_HISTORY','historical_price',sec*1000,received,result);
      store.db.prepare('INSERT OR IGNORE INTO historical_prices(source_ts_ms,queried_at_ms,received_at_ms,price_usd,raw_sha,provenance) VALUES(?,?,?,?,?,?)').run(sec*1000,queried,received,Number(result.value),sha(result),'HISTORICAL_BACKFILL');
      ok++;
    }catch(e){failed++;const msg=String(e?.message||'ERROR');errors.push({timestamp:sec,error:msg});if(msg.includes('429')||msg.includes('403')){log.warn?.('RATE_OR_ACCESS_BLOCKED_STOP',msg);break;}}
    await sleep(2100); // <=0.5 GET/s against an undocumented interface
  }
  return {attempted:ok+failed,ok,failed,errors:errors.slice(0,30),provenance:'HISTORICAL_BACKFILL_NEVER_LIVE',note:'Round labels are not derived from this table.'};
}
