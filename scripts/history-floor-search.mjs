#!/usr/bin/env node
// Binary-search history floors. Bounded: ~16 GETs, 2100ms spacing.
import fs from 'node:fs';
const PRICE_BASE = 'https://prediction-market-price-service.fly.dev/price/crypto/btcusdt';
const ROUND_BASE = 'https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC';
const SLEEP_MS = 2100;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getRaw(url, timeoutMs=10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {method:'GET', headers:{accept:'application/json'}, signal: ctrl.signal, redirect:'error'});
    const text = await res.text();
    let json=null; try{json=JSON.parse(text);}catch{}
    return {status: res.status, ok: res.ok, json, len: text.length};
  } catch(e){ return {status:'FETCH_ERROR', ok:false, error:String(e?.message||e).slice(0,120)}; }
  finally{clearTimeout(t);}
}
async function priceOk(sec){
  const r = await getRaw(`${PRICE_BASE}?timestamp=${sec}`);
  const ok = r.ok && r.json?.symbol?.toLowerCase()==='btcusdt' && Number(r.json?.timestamp)===sec*1000 && Number.isFinite(Number(r.json?.value));
  return {ok, status: r.status, value: r.json?.value ?? null};
}
async function roundOk(openTs){
  const r = await getRaw(`${ROUND_BASE}/${openTs}`);
  const ok = r.ok && r.json && typeof r.json.id==='string';
  return {ok, status: r.status, id: r.json?.id||null, outcome: r.json?.outcome||null, err: r.json?.message||r.error||null};
}
function minuteAlign(s){return Math.floor(s/60)*60;}
async function main(){
  const prev = JSON.parse(fs.readFileSync('research/history/price-retention.json','utf8'));
  // PRICE floor: ok=1790151481, fail=1788769081
  let lo = 1788769081, hi = 1790151481; // lo=fail, hi=ok; invariant: lo fails, hi succeeds
  // verify invariant quickly (already probed, but re-confirm hi only to save a call; trust prior)
  const steps = [];
  console.log(`PRICE binary search fail=${lo} ok=${hi}`);
  for (let i=0;i<8;i++){
    const mid = Math.floor((lo+hi)/2);
    console.log(` price probe ${i+1}/8 mid=${mid} (${new Date(mid*1000).toISOString()})`);
    const r = await priceOk(mid);
    console.log(`  -> ok=${r.ok} status=${r.status} value=${r.value}`);
    steps.push({mid, ...r});
    if (r.ok) hi = mid; else lo = mid;
    await sleep(SLEEP_MS);
  }
  console.log(`PRICE floor in (${lo}, ${hi}] span=${hi-lo}s`);
  // ROUND floor: ok=1790756280, fail=1790151480
  let rlo = 1790151480, rhi = 1790756280;
  const rsteps = [];
  console.log(`ROUND binary search fail=${rlo} ok=${rhi}`);
  for (let i=0;i<8;i++){
    let mid = Math.floor((rlo+rhi)/2);
    mid = minuteAlign(mid);
    if (mid<=rlo){mid=rlo+60;} if(mid>=rhi){mid=rhi-60;}
    console.log(` round probe ${i+1}/8 mid=${mid} (${new Date(mid*1000).toISOString()})`);
    const r = await roundOk(mid);
    console.log(`  -> ok=${r.ok} status=${r.status} id=${r.id} outcome=${r.outcome} err=${r.err}`);
    rsteps.push({mid, ...r});
    if (r.ok) rhi = mid; else rlo = mid;
    await sleep(SLEEP_MS);
  }
  console.log(`ROUND floor in (${rlo}, ${rhi}] span=${rhi-rlo}s`);
  const out = {probedAt: new Date().toISOString(), priceFloor: {failLo: lo, okHi: hi, spanSec: hi-lo, failIso: new Date(lo*1000).toISOString(), okIso: new Date(hi*1000).toISOString(), steps}, roundFloor: {failLo: rlo, okHi: rhi, spanSec: rhi-rlo, failIso: new Date(rlo*1000).toISOString(), okIso: new Date(rhi*1000).toISOString(), steps: rsteps}};
  fs.writeFileSync('research/history/retention-floor.json', JSON.stringify(out, null, 2));
  console.log('WROTE research/history/retention-floor.json');
  console.log(JSON.stringify(out.priceFloor, null, 2));
  console.log(JSON.stringify(out.roundFloor, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1);});
