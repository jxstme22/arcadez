#!/usr/bin/env node
// Bounded historical retention discovery — Jupiter-only read-only GETs.
// Price: GET /price/crypto/btcusdt?timestamp={sec}
// Rounds: GET /play/rounds/BTC/{openTs minute-aligned}
// Spacing 2100ms, stop on 429/403, max ~40 GETs total. Resume via JSON checkpoint.
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const PRICE_BASE = 'https://prediction-market-price-service.fly.dev/price/crypto/btcusdt';
const ROUND_BASE = 'https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC';
const SLEEP_MS = 2100;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = v => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

async function getRaw(url, timeoutMs=10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {method: 'GET', headers: {accept: 'application/json'}, signal: ctrl.signal, redirect: 'error'});
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {status: res.status, ok: res.ok, textLen: text.length, json, sha: sha(text.slice(0, 500000))};
  } catch (e) {
    return {status: 'FETCH_ERROR', ok: false, error: String(e?.message || e).slice(0, 200), sha: null};
  } finally { clearTimeout(t); }
}

async function probePrice(sec, retrieved_at) {
  const url = `${PRICE_BASE}?timestamp=${sec}`;
  const requested_ts = sec;
  const r = await getRaw(url);
  let returned_ts = null, raw_value = null, parsed_value = null;
  if (r.json) {
    returned_ts = r.json.timestamp ?? null;
    raw_value = r.json.value ?? null;
    const pv = Number(r.json.value);
    parsed_value = Number.isFinite(pv) ? pv : null;
  }
  return {kind: 'price', requested_ts, returned_ts, raw_value, parsed_value, retrieved_at: new Date().toISOString(), http_status: r.status, response_hash: r.sha, url, ok_detailed: r.ok && r.json?.symbol?.toLowerCase() === 'btcusdt' && Number(r.json?.timestamp) === sec*1000 && Number.isFinite(Number(r.json?.value)), error: r.error || null, raw_symbol: r.json?.symbol || null};
}

async function probeRound(openTs) {
  const url = `${ROUND_BASE}/${openTs}`;
  const r = await getRaw(url);
  const j = r.json;
  const ok = r.ok && j && typeof j.id === 'string';
  return {kind: 'round', requested_ts: openTs, returned_id: j?.id || null, returned_status: j?.status || null, returned_outcome: j?.outcome || null, openPrice: j?.openPrice || null, closePrice: j?.closePrice || null, retrieved_at: new Date().toISOString(), http_status: r.status, response_hash: r.sha, url, ok_detailed: !!ok, error: r.error || (j?.message ? String(j.message).slice(0,200) : null)};
}

function minuteAlign(sec) { return Math.floor(sec/60)*60; }

async function main() {
  const nowSec = Math.floor(Date.now()/1000);
  const outDir = 'research/history';
  fs.mkdirSync(outDir, {recursive:true});
  // Exponential offsets backward
  const offsets = [15*60, 60*60, 6*60*60, 24*60*60, 3*24*60*60, 7*24*60*60, 14*24*60*60, 30*24*60*60, 60*24*60*60, 90*24*60*60, 180*24*60*60, 365*24*60*60];
  const results = {probedAt: new Date().toISOString(), nowSec, nowIso: new Date(nowSec*1000).toISOString(), priceProbes: [], roundProbes: [], granularity: [], notes: []};
  console.log(`RETENTION_PROBE now=${results.nowIso} (${nowSec})`);
  // Price exponential probing
  for (const off of offsets) {
    const sec = nowSec - off;
    console.log(`price probe -${(off/3600).toFixed(2)}h ts=${sec} ...`);
    const pr = await probePrice(sec);
    results.priceProbes.push({offsetSec: off, ...pr});
    console.log(`  -> status=${pr.http_status} ok=${pr.ok_detailed} value=${pr.parsed_value} err=${pr.error}`);
    if (pr.http_status === 429 || pr.http_status === 403) { results.notes.push('PRICE_RATE_OR_ACCESS_BLOCKED_STOP'); break; }
    await sleep(SLEEP_MS);
    // Stop after 2 consecutive hard failures beyond first success? Continue to map full curve but bounded.
    // If 404/422/500 and offset large, keep going to confirm floor, but cap at offsets list.
  }
  // Round exponential probing (minute-aligned)
  for (const off of offsets) {
    const sec = minuteAlign(nowSec - off);
    console.log(`round probe -${(off/3600).toFixed(2)}h openTs=${sec} ...`);
    const rr = await probeRound(sec);
    results.roundProbes.push({offsetSec: off, ...rr});
    console.log(`  -> status=${rr.http_status} ok=${rr.ok_detailed} id=${rr.returned_id} status/outcome=${rr.returned_status}/${rr.returned_outcome} err=${rr.error}`);
    if (rr.http_status === 429 || rr.http_status === 403) { results.notes.push('ROUND_RATE_OR_ACCESS_BLOCKED_STOP'); break; }
    await sleep(SLEEP_MS);
  }
  // Granularity: 5 consecutive seconds near now-20min (safely settled)
  const gBase = nowSec - 20*60;
  console.log(`granularity probe base=${gBase}`);
  for (let d = 0; d < 5; d++) {
    const sec = gBase + d;
    const pr = await probePrice(sec);
    results.granularity.push({requested_ts: sec, returned_ts: pr.returned_ts, value: pr.parsed_value, status: pr.http_status, ok: pr.ok_detailed});
    console.log(`  sec ${sec} -> ${pr.parsed_value} status=${pr.http_status}`);
    await sleep(SLEEP_MS);
  }
  // Determinism: re-request same ts twice
  const detTs = nowSec - 30*60;
  const a = await probePrice(detTs);
  await sleep(SLEEP_MS);
  const b = await probePrice(detTs);
  results.determinism = {ts: detTs, a_value: a.parsed_value, b_value: b.parsed_value, a_hash: a.response_hash, b_hash: b.response_hash, identical: a.parsed_value === b.parsed_value};
  console.log(`determinism ts=${detTs} a=${a.parsed_value} b=${b.parsed_value} identical=${results.determinism.identical}`);

  fs.writeFileSync(`${outDir}/price-retention.json`, JSON.stringify(results, null, 2));
  console.log(`WROTE ${outDir}/price-retention.json probes=${results.priceProbes.length + results.roundProbes.length + results.granularity.length + 2}`);
}

main().catch(e => { console.error('PROBE_FAILED', e); process.exit(1); });
