#!/usr/bin/env node
// Bounded /play round-route matrix probe — read-only GETs only, 2100ms spacing.
// Tests documented params + undocumented pagination guesses (cursor/beforeTs/history)
// WITHOUT inventing endpoints. Wallet routes NOT probed with real addresses.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const SLEEP = 2100;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = v => createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {method:'GET', headers:{accept:'application/json'}, signal: ctrl.signal, redirect:'error'});
    const text = await res.text();
    let json=null; try{json=JSON.parse(text);}catch{}
    return {status: res.status, ok: res.ok, len: text.length, sha: sha(text.slice(0,200000)), json, errBody: !res.ok ? text.slice(0,300) : null};
  } catch(e){ return {status:'FETCH_ERROR', ok:false, error:String(e?.message||e).slice(0,150)}; }
  finally{clearTimeout(t);}
}
function summarizeRounds(json){
  if(!json) return {n:null};
  const arr = json.data || json.live || [];
  if(!Array.isArray(arr)) return {keys:Object.keys(json), n:null};
  return {n: arr.length, first: arr[0]?.id||null, last: arr[arr.length-1]?.id||null, serverTime: json.serverTime||null};
}
async function main(){
  const cases = [
    ['timeline_baseline','https://prediction-market-api.jup.ag/api/v1/play/rounds?asset=BTC&before=5&after=1'],
    ['timeline_max','https://prediction-market-api.jup.ag/api/v1/play/rounds?asset=BTC&before=20&after=20'],
    ['timeline_zero','https://prediction-market-api.jup.ag/api/v1/play/rounds?asset=BTC&before=0&after=0'],
    ['timeline_defaults','https://prediction-market-api.jup.ag/api/v1/play/rounds?asset=BTC'],
    ['timeline_no_asset','https://prediction-market-api.jup.ag/api/v1/play/rounds'],
    ['timeline_overmax','https://prediction-market-api.jup.ag/api/v1/play/rounds?asset=BTC&before=21&after=1'],
    ['timeline_cursor_guess','https://prediction-market-api.jup.ag/api/v1/play/rounds?asset=BTC&before=5&after=1&cursor=1791345660'],
    ['current','https://prediction-market-api.jup.ag/api/v1/play/rounds/current'],
    ['config','https://prediction-market-api.jup.ag/api/v1/play/config'],
  ];
  const nowSec = Math.floor(Date.now()/1000);
  const minute = Math.floor(nowSec/60)*60;
  cases.push(['single_recent_settled', `https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/${minute-20*60}`]);
  cases.push(['single_future', `https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/${minute+60}`]);
  cases.push(['single_old_floor', `https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/1790364060`]);
  cases.push(['single_below_floor', `https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/1790361720`]);
  cases.push(['single_offgrid', `https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/${minute-20*60+30}`]);
  const rows = [];
  for (const [name, url] of cases) {
    console.log(`${name} GET ${url}`);
    const r = await get(url);
    const sum = r.json ? summarizeRounds(r.json) : {};
    console.log(`  -> ${r.status} ok=${r.ok} ${JSON.stringify(sum)} err=${(r.errBody||r.error||'').slice(0,120)}`);
    rows.push({name, url: url.replace(/wallet|4bPw.*/,'<redacted>'), status: r.status, ok: r.ok, sha: r.sha, len: r.len, summary: sum, err: (r.errBody||r.error||null)?.slice(0,300) || null, single: r.json && r.json.id ? {id:r.json.id, status:r.json.status, outcome:r.json.outcome} : null});
    await sleep(SLEEP);
    if (r.status===429||r.status===403){rows.push({note:'RATE_OR_ACCESS_BLOCKED_STOP'});break;}
  }
  fs.mkdirSync('research/history',{recursive:true});
  fs.writeFileSync('research/history/round-matrix-raw.json', JSON.stringify({probedAt:new Date().toISOString(), rows}, null, 2));
  console.log('WROTE research/history/round-matrix-raw.json');
}
main().catch(e=>{console.error(e);process.exit(1);});
