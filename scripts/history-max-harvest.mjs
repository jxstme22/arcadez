#!/usr/bin/env node
// Maximum-harvest: rounds (labels) + 60s price grid + 1s densification.
// Newest-first, resumable via checkpoint JSON, INSERT OR IGNORE cache,
// per-request evidence (requested/returned/raw/parsed/retrieved/status/hash/retries),
// sequential with spacing + exponential backoff, stop on 429/403.
// Usage:
//   node scripts/history-max-harvest.mjs rounds --max-requests 300
//   node scripts/history-max-harvest.mjs prices60 --max-requests 300
//   node scripts/history-max-harvest.mjs prices1 --open-ts <minuteTs> --window-back 600 --window-fwd 60
// Env: DATA_DIR (default ./var/history), SPACING_MS (default 1600).
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {normalizeRound} from '../src/market.mjs';

const sha = v => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SPACING = Number(process.env.SPACING_MS || 1600);
const DATA_DIR = process.env.DATA_DIR || './var/history';
const CKPT = 'research/history/checkpoint-max.json';

function loadCkpt() {
  try { return JSON.parse(fs.readFileSync(CKPT, 'utf8')); }
  catch { return {rounds: {nextOpenTs: null, done: 0, miss: 0}, prices60: {nextTs: null, done: 0, miss: 0}, prices1: {doneSecs: 0}}; }
}
function saveCkpt(c) { fs.mkdirSync(path.dirname(CKPT), {recursive: true}); fs.writeFileSync(CKPT, JSON.stringify(c, null, 2)); }
// Section-atomic save: reload, replace only own section (two harvesters share this file).
function saveCkptSection(name, value) {
  const c = loadCkpt();
  c[name] = value;
  saveCkpt(c);
}
function minuteAlign(s) { return Math.floor(s / 60) * 60; }

async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {method: 'GET', headers: {accept: 'application/json'}, signal: ctrl.signal, redirect: 'error'});
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {status: res.status, ok: res.ok, text, json, hash: sha(text.slice(0, 500000)), elapsed: Date.now() - started};
  } catch (e) {
    return {status: 'FETCH_ERROR', ok: false, error: String(e?.message || e).slice(0, 160), elapsed: Date.now() - started};
  } finally { clearTimeout(t); }
}

async function getWithBackoff(url, maxRetries = 3) {
  let attempt = 0, delay = 2000;
  const retries = [];
  while (true) {
    const r = await fetchJson(url);
    if (r.ok || !(r.status === 429 || r.status === 502 || r.status === 503 || r.status === 'FETCH_ERROR')) {
      r.retries = retries;
      return r;
    }
    retries.push({attempt, status: r.status, delayMs: delay});
    if (attempt >= maxRetries) { r.retries = retries; r.backoffExhausted = true; return r; }
    await sleep(delay + Math.floor(Math.random() * 500));
    delay *= 2;
    attempt++;
  }
}

function ensureEvidenceTables(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS harvest_requests(
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
    requested_ts INTEGER NOT NULL, returned_ts INTEGER, raw_value TEXT,
    parsed_value REAL, retrieved_at_ms INTEGER NOT NULL, http_status TEXT NOT NULL,
    response_hash TEXT, retries INTEGER NOT NULL DEFAULT 0, error TEXT,
    UNIQUE(kind, requested_ts));`);
}

async function phaseRounds(maxRequests) {
  const store = new Store(DATA_DIR);
  ensureEvidenceTables(store);
  const ck = loadCkpt();
  const nowSec = Math.floor(Date.now() / 1000);
  // Safe recent edge: newest target must be settled (allow 15 min settlement + clock).
  let next = ck.rounds.nextOpenTs ?? minuteAlign(nowSec - 16 * 60);
  const floor = 1790364060; // conservative observed floor (may extend 39min earlier; harvest probes 404s cheaply)
  let done = 0, ok = 0, miss = 0, stopped = null;
  const missing = [];
  console.log(`ROUNDS newest-first from=${next} (${new Date(next * 1000).toISOString()}) floor~${floor} maxReq=${maxRequests} spacing=${SPACING}`);
  while (done < maxRequests && next >= floor - 3600) {
    // Skip cached
    const have = store.db.prepare('SELECT 1 AS x FROM historical_rounds WHERE id=?').get(`btc-${next}`);
    if (have) { next -= 60; continue; }
    const url = `https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/${next}`;
    const retrieved = Date.now();
    const r = await getWithBackoff(url);
    const req = {kind: 'round', requested_ts: next, retrieved_at_ms: retrieved, http_status: String(r.status), response_hash: r.hash || null, retries: (r.retries || []).length};
    if (r.ok && r.json && typeof r.json.id === 'string') {
      const nr = normalizeRound(r.json);
      if (nr && (nr.result === 'UP' || nr.result === 'DOWN' || nr.result === 'VOID')) {
        store.saveHistoricalRound(nr, nr.result === 'VOID' ? 'VENUE_RECORDED_VOID' : 'VENUE_RECORDED', retrieved);
        store.raw('JUPITER_HISTORY', 'historical_round', nr.startMs, retrieved, r.json);
        try {
          const up = Number(r.json.upPool ?? NaN), down = Number(r.json.downPool ?? NaN);
          if (Number.isFinite(up) || Number.isFinite(down)) {
            store.db.prepare('INSERT OR IGNORE INTO pool_observations(round_id,observed_ms,up_pool_micro,down_pool_micro,fee_micro,venue_status,venue_outcome,sha) VALUES(?,?,?,?,?,?,?,?)')
              .run(nr.id, retrieved, r.json.upPool ?? null, r.json.downPool ?? null, r.json.feeAmount ?? null, nr.venueStatus ?? null, nr.venueOutcome ?? null, sha(nr.id + retrieved));
          }
        } catch {}
        ok++;
      } else { miss++; missing.push(next); }
    } else {
      miss++; missing.push(next);
      req.error = (r.json?.message || r.error || '').slice(0, 200) || null;
      if (r.status === 429 || r.status === 403) { stopped = `RATE_OR_ACCESS_BLOCKED_${r.status}`; store.db.prepare('INSERT OR IGNORE INTO harvest_requests(kind,requested_ts,returned_ts,raw_value,parsed_value,retrieved_at_ms,http_status,response_hash,retries,error) VALUES(?,?,?,?,?,?,?,?,?,?)').run(req.kind, req.requested_ts, null, null, null, req.retrieved_at_ms, req.http_status, req.response_hash, req.retries, req.error); break; }
      if (r.backoffExhausted) { stopped = `BACKOFF_EXHAUSTED_${r.status}`; }
    }
    try {
      store.db.prepare('INSERT OR IGNORE INTO harvest_requests(kind,requested_ts,returned_ts,raw_value,parsed_value,retrieved_at_ms,http_status,response_hash,retries,error) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(req.kind, req.requested_ts, r.json?.openTs ?? null, r.json?.closePrice ? String(r.json.closePrice).slice(0, 64) : null, null, req.retrieved_at_ms, req.http_status, req.response_hash, req.retries, req.error || null);
    } catch {}
    done++;
    next -= 60;
    ck.rounds = {nextOpenTs: next, done: (ck.rounds.done || 0) + 1, miss: (ck.rounds.miss || 0) + (r.ok ? 0 : 1)};
    if (done % 25 === 0) { saveCkptSection('rounds', ck.rounds); console.log(`  ckpt rounds done=${done} ok=${ok} miss=${miss} next=${next}`); }
    await sleep(SPACING + Math.floor(Math.random() * 400));
  }
  saveCkptSection('rounds', ck.rounds);
  const totals = store.db.prepare('SELECT COUNT(*) AS n FROM historical_rounds').get();
  console.log(JSON.stringify({phase: 'rounds', requested: done, ok, miss, missingSample: missing.slice(0, 10), stopped, nextOpenTs: next, totalRoundsInDb: totals.n}));
  store.close();
}

async function phasePrices60(maxRequests) {
  const store = new Store(DATA_DIR);
  ensureEvidenceTables(store);
  store.db.exec(`CREATE TABLE IF NOT EXISTS historical_prices(source_ts_ms INTEGER PRIMARY KEY,
    queried_at_ms INTEGER NOT NULL, received_at_ms INTEGER NOT NULL, price_usd REAL NOT NULL, raw_sha TEXT NOT NULL,
    provenance TEXT NOT NULL);`);
  const ck = loadCkpt();
  const nowSec = Math.floor(Date.now() / 1000);
  let next = ck.prices60.nextTs ?? minuteAlign(nowSec - 16 * 60);
  const floor = 1788774481;
  let done = 0, ok = 0, miss = 0, stopped = null;
  console.log(`PRICES60 newest-first from=${next} floor~${floor} maxReq=${maxRequests}`);
  while (done < maxRequests && next >= floor) {
    const have = store.db.prepare('SELECT 1 AS x FROM historical_prices WHERE source_ts_ms=?').get(next * 1000);
    if (have) { next -= 60; continue; }
    const url = `https://prediction-market-price-service.fly.dev/price/crypto/btcusdt?timestamp=${next}`;
    const queried = Date.now();
    const r = await getWithBackoff(url);
    const received = Date.now();
    if (r.ok && r.json?.symbol?.toLowerCase() === 'btcusdt' && Number(r.json?.timestamp) === next * 1000 && Number.isFinite(Number(r.json?.value))) {
      store.raw('JUPITER_HISTORY', 'historical_price', next * 1000, received, r.json);
      try { store.db.prepare('INSERT OR IGNORE INTO historical_prices(source_ts_ms,queried_at_ms,received_at_ms,price_usd,raw_sha,provenance) VALUES(?,?,?,?,?,?)').run(next * 1000, queried, received, Number(r.json.value), r.hash, 'HISTORICAL_BACKFILL'); } catch {}
      try { store.db.prepare('INSERT OR IGNORE INTO harvest_requests(kind,requested_ts,returned_ts,raw_value,parsed_value,retrieved_at_ms,http_status,response_hash,retries,error) VALUES(?,?,?,?,?,?,?,?,?,?)').run('price60', next, next, String(r.json.value).slice(0, 64), Number(r.json.value), received, String(r.status), r.hash, (r.retries || []).length, null); } catch {}
      ok++;
    } else {
      miss++;
      const err = (r.json?.error || r.json?.message || r.error || '').slice(0, 200) || null;
      try { store.db.prepare('INSERT OR IGNORE INTO harvest_requests(kind,requested_ts,returned_ts,raw_value,parsed_value,retrieved_at_ms,http_status,response_hash,retries,error) VALUES(?,?,?,?,?,?,?,?,?,?)').run('price60', next, r.json?.timestamp ? Math.floor(Number(r.json.timestamp) / 1000) : null, r.json?.value != null ? String(r.json.value).slice(0, 64) : null, null, received, String(r.status), r.hash || null, (r.retries || []).length, err); } catch {}
      if (r.status === 429 || r.status === 403) { stopped = `RATE_OR_ACCESS_BLOCKED_${r.status}`; break; }
      if (r.backoffExhausted) stopped = `BACKOFF_EXHAUSTED_${r.status}`;
    }
    done++;
    next -= 60;
    ck.prices60 = {nextTs: next, done: (ck.prices60.done || 0) + 1, miss: (ck.prices60.miss || 0)};
    if (done % 25 === 0) { saveCkptSection('prices60', ck.prices60); console.log(`  ckpt prices60 done=${done} ok=${ok} miss=${miss} next=${next}`); }
    await sleep(SPACING + Math.floor(Math.random() * 400));
  }
  saveCkptSection('prices60', ck.prices60);
  const totals = store.db.prepare('SELECT COUNT(*) AS n, MIN(source_ts_ms) AS mn, MAX(source_ts_ms) AS mx FROM historical_prices').get();
  console.log(JSON.stringify({phase: 'prices60', requested: done, ok, miss, stopped, nextTs: next, totals}));
  store.close();
}

async function phasePrices1(openTs, back = 600, fwd = 60) {
  const store = new Store(DATA_DIR);
  ensureEvidenceTables(store);
  store.db.exec(`CREATE TABLE IF NOT EXISTS historical_prices_1s(source_ts_ms INTEGER PRIMARY KEY,
    queried_at_ms INTEGER NOT NULL, received_at_ms INTEGER NOT NULL, price_usd REAL NOT NULL, raw_sha TEXT NOT NULL,
    provenance TEXT NOT NULL CHECK(provenance='HISTORICAL_BACKFILL_1S'));`);
  const from = openTs - back, to = openTs + fwd;
  let done = 0, ok = 0, miss = 0;
  console.log(`PRICES1 openTs=${openTs} window=[${from},${to}] n=${to - from + 1} secs`);
  for (let sec = to; sec >= from; sec--) {
    const have = store.db.prepare('SELECT 1 AS x FROM historical_prices_1s WHERE source_ts_ms=?').get(sec * 1000);
    if (have) continue;
    // Also consult 60s table to avoid redownload
    const have60 = store.db.prepare('SELECT price_usd AS p FROM historical_prices WHERE source_ts_ms=?').get(sec * 1000);
    const url = `https://prediction-market-price-service.fly.dev/price/crypto/btcusdt?timestamp=${sec}`;
    const queried = Date.now();
    const r = await getWithBackoff(url, 2);
    const received = Date.now();
    if (r.ok && Number(r.json?.timestamp) === sec * 1000 && Number.isFinite(Number(r.json?.value))) {
      store.raw('JUPITER_HISTORY', 'historical_price_1s', sec * 1000, received, r.json);
      try { store.db.prepare('INSERT OR IGNORE INTO historical_prices_1s(source_ts_ms,queried_at_ms,received_at_ms,price_usd,raw_sha,provenance) VALUES(?,?,?,?,?,?)').run(sec * 1000, queried, received, Number(r.json.value), r.hash, 'HISTORICAL_BACKFILL_1S'); } catch {}
      ok++;
    } else {
      miss++;
      if (r.status === 429 || r.status === 403) { console.log(`RATE_OR_ACCESS_BLOCKED_${r.status}_STOP`); break; }
      if (have60) { /* 60s fallback noted in coverage, not copied as 1s */ }
    }
    done++;
    if (done % 50 === 0) console.log(`  prices1 done=${done} ok=${ok} miss=${miss} sec=${sec}`);
    await sleep(SPACING + Math.floor(Math.random() * 400));
  }
  const cur1 = loadCkpt();
  cur1.prices1.doneSecs = (cur1.prices1.doneSecs || 0) + ok;
  saveCkptSection('prices1', cur1.prices1);
  console.log(JSON.stringify({phase: 'prices1', openTs, requested: done, ok, miss}));
  store.close();
}

const [phase, ...rest] = process.argv.slice(2);
const arg = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const maxReq = Number(arg('--max-requests') || 300);

// Forward fill: from --from-ts (inclusive, minute-aligned) up to now-16min.
// Closes the live-edge gap left by newest-first backward harvesting.
async function phaseRoundsForward(fromTs, maxRequests) {
  const store = new Store(DATA_DIR);
  ensureEvidenceTables(store);
  const endTs = minuteAlign(Math.floor(Date.now() / 1000) - 16 * 60);
  let next = minuteAlign(fromTs), done = 0, ok = 0, miss = 0;
  console.log(`ROUNDS-FORWARD from=${next} to=${endTs} maxReq=${maxRequests}`);
  while (done < maxRequests && next <= endTs) {
    if (!store.db.prepare('SELECT 1 AS x FROM historical_rounds WHERE id=?').get(`btc-${next}`)) {
      const url = `https://prediction-market-api.jup.ag/api/v1/play/rounds/BTC/${next}`;
      const retrieved = Date.now();
      const r = await getWithBackoff(url);
      if (r.ok && r.json && typeof r.json.id === 'string') {
        const nr = normalizeRound(r.json);
        if (nr && (nr.result === 'UP' || nr.result === 'DOWN' || nr.result === 'VOID')) {
          store.saveHistoricalRound(nr, nr.result === 'VOID' ? 'VENUE_RECORDED_VOID' : 'VENUE_RECORDED', retrieved);
          store.raw('JUPITER_HISTORY', 'historical_round', nr.startMs, retrieved, r.json);
          ok++;
        } else miss++;
      } else {
        miss++;
        if (r.status === 429 || r.status === 403) { console.log(`RATE_OR_ACCESS_BLOCKED_${r.status}_STOP`); break; }
      }
      try {
        store.db.prepare('INSERT OR IGNORE INTO harvest_requests(kind,requested_ts,returned_ts,raw_value,parsed_value,retrieved_at_ms,http_status,response_hash,retries,error) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run('round', next, r.json?.openTs ?? null, null, null, retrieved, String(r.status), r.hash || null, (r.retries || []).length, (!r.ok ? (r.json?.message || r.error || '').slice(0, 200) : null));
      } catch {}
      done++;
      await sleep(SPACING + Math.floor(Math.random() * 400));
    }
    next += 60;
  }
  const totals = store.db.prepare('SELECT COUNT(*) AS n FROM historical_rounds').get();
  console.log(JSON.stringify({phase: 'rounds-forward', requested: done, ok, miss, totalRoundsInDb: totals.n}));
  store.close();
}

async function phasePrices60Forward(fromTs, maxRequests) {
  const store = new Store(DATA_DIR);
  ensureEvidenceTables(store);
  const endTs = minuteAlign(Math.floor(Date.now() / 1000) - 5 * 60);
  let next = minuteAlign(fromTs), done = 0, ok = 0, miss = 0;
  console.log(`PRICES60-FORWARD from=${next} to=${endTs} maxReq=${maxRequests}`);
  while (done < maxRequests && next <= endTs) {
    if (!store.db.prepare('SELECT 1 AS x FROM historical_prices WHERE source_ts_ms=?').get(next * 1000)) {
      const url = `https://prediction-market-price-service.fly.dev/price/crypto/btcusdt?timestamp=${next}`;
      const queried = Date.now();
      const r = await getWithBackoff(url);
      const received = Date.now();
      if (r.ok && r.json?.symbol?.toLowerCase() === 'btcusdt' && Number(r.json?.timestamp) === next * 1000 && Number.isFinite(Number(r.json?.value))) {
        store.raw('JUPITER_HISTORY', 'historical_price', next * 1000, received, r.json);
        try { store.db.prepare('INSERT OR IGNORE INTO historical_prices(source_ts_ms,queried_at_ms,received_at_ms,price_usd,raw_sha,provenance) VALUES(?,?,?,?,?,?)').run(next * 1000, queried, received, Number(r.json.value), r.hash, 'HISTORICAL_BACKFILL'); } catch {}
        ok++;
      } else {
        miss++;
        if (r.status === 429 || r.status === 403) { console.log(`RATE_OR_ACCESS_BLOCKED_${r.status}_STOP`); break; }
      }
      done++;
      await sleep(SPACING + Math.floor(Math.random() * 400));
    }
    next += 60;
  }
  console.log(JSON.stringify({phase: 'prices60-forward', requested: done, ok, miss}));
  store.close();
}

if (phase === 'rounds') await phaseRounds(maxReq);
else if (phase === 'rounds-forward') {
  const fromTs = Number(arg('--from-ts'));
  if (!Number.isInteger(fromTs)) throw new Error('FORWARD_USAGE: --from-ts <minuteTs>');
  await phaseRoundsForward(fromTs, maxReq);
}
else if (phase === 'prices60') await phasePrices60(maxReq);
else if (phase === 'prices60-forward') {
  const fromTs = Number(arg('--from-ts'));
  if (!Number.isInteger(fromTs)) throw new Error('PFORWARD_USAGE: --from-ts <minuteTs>');
  await phasePrices60Forward(fromTs, maxReq);
}
else if (phase === 'prices1') {
  const openTs = Number(arg('--open-ts'));
  if (!Number.isInteger(openTs)) throw new Error('PRICES1_USAGE: --open-ts <minuteTs>');
  await phasePrices1(openTs, Number(arg('--window-back') || 600), Number(arg('--window-fwd') || 60));
} else { console.error('USAGE: rounds|prices60|prices1 [--max-requests N] [--open-ts T --window-back 600 --window-fwd 60]'); process.exit(1); }
