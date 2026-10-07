// Production-safe Jupiter crypto WS adapter — verified protocol 2026-10-07.
// Subscribe {type:'subscribe',symbols:['btcusdt']}; snapshot + {symbol,value,timestamp(ms)} ticks.
import {assertSafeWs} from './http.mjs';
import {normalizeTick} from './market.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const WS_STATES = ['DISCONNECTED','CONNECTING','CONNECTED_UNSUBSCRIBED','SUBSCRIBING','LIVE','STALE','RECONNECTING','FAILED'];
export const SYMBOL = 'btcusdt';
export const COLLECTOR_VERSION = 'ws.mjs/3';
export const SCHEMA_VERSION = 'jup-crypto-ws/1';
export function decodeFrame(json) {
  // Returns {kind, ticks[], note}. Never throws on unknown shapes.
  if (json && typeof json === 'object' && typeof json.type === 'string') {
    const t = json.type;
    if (t === 'snapshot' && Array.isArray(json.data)) return {kind:'snapshot', ticks: json.data, symbol: json.symbol ?? null};
    if (['subscribed','unsubscribed','unsubscribed_all','error'].includes(t)) return {kind:t, ticks:[], note: json};
    return {kind:'unknown_control', ticks:[], note: json};
  }
  if (json && typeof json === 'object' && json.symbol != null) return {kind:'tick', ticks:[json]};
  if (Array.isArray(json)) return {kind:'batch', ticks: json};
  return {kind:'malformed', ticks:[], note: json};
}
export function makePriceStream(cfg, store, logger = console) {
  let state = 'DISCONNECTED';
  let ws = null;
  let stopped = false;
  let lastMsgMs = 0;
  let lastTickMs = 0;
  let reconnects = 0;
  let frames = 0, validTicks = 0, duplicates = 0, malformed = 0, gaps = 0, maxGapMs = 0;
  let lastSourceMs = 0;
  let interArrivals = [];
  let lastArrivalMs = 0;
  let sessionId = null;
  let sessionFrames = 0, sessionValid = 0;
  const seenTs = new Set();
  const setState = s => { state = s; try { store.saveEvidence('arcade.ws.state', {state, at: new Date().toISOString(), reconnects}); } catch {} };
  function recordHealth() {
    try {
      store.db.exec(`CREATE TABLE IF NOT EXISTS ws_health(id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER NOT NULL, state TEXT NOT NULL, frames INTEGER NOT NULL, valid_ticks INTEGER NOT NULL, duplicates INTEGER NOT NULL, malformed INTEGER NOT NULL, gaps INTEGER NOT NULL, max_gap_ms INTEGER NOT NULL);`);
      store.db.prepare('INSERT INTO ws_health(at_ms,state,frames,valid_ticks,duplicates,malformed,gaps,max_gap_ms) VALUES(?,?,?,?,?,?,?,?)').run(Date.now(), state, frames, validTicks, duplicates, malformed, gaps, maxGapMs);
    } catch {}
  }
  function ledger(raw, at, outcome) {
    // Append-only raw tick ledger (H01): every decoded candidate recorded with session + gap metadata.
    try {
      store.saveRawTick({sessionId, raw, symbol: outcome?.symbol ?? null, price: outcome?.price ?? null,
        sourceMs: outcome?.sourceMs ?? null, receiveMs: at, ingestMs: Date.now(),
        gapBeforeMs: outcome && lastSourceMs ? outcome.sourceMs - lastSourceMs : null,
        duplicate: outcome === 'dup', valid: !!outcome && outcome !== 'dup',
        invalidReason: outcome ? (outcome === 'dup' ? 'DUPLICATE_TS' : null) : 'SCHEMA_OR_FRESHNESS',
        collectorVersion: COLLECTOR_VERSION, schemaVersion: SCHEMA_VERSION, provenance: 'LIVE_RECEIVED_WS'});
    } catch {}
  }
  function ingestTick(raw, at) {
    const t = normalizeTick(raw, at);
    if (!t) { malformed++; ledger(raw, at, null); try { store.raw('JUPITER_PRICE_WS','ws_tick_rejected',null,at,{raw,reason:'SCHEMA_OR_FRESHNESS'}); } catch {} return null; }
    if (t.sourceMs === lastSourceMs) { duplicates++; ledger(raw, at, {...t, symbol:'BTC'}); return 'dup'; }
    if (t.sourceMs < lastSourceMs) { try { store.raw('JUPITER_PRICE_WS','ws_tick_out_of_order',t.sourceMs,at,raw); } catch {} malformed++; ledger(raw, at, null); return null; }
    const gap = lastSourceMs ? t.sourceMs - lastSourceMs : 0;
    if (lastSourceMs && gap > 3500) { gaps++; maxGapMs = Math.max(maxGapMs, gap); try { store.recordGap(sessionId, lastSourceMs, t.sourceMs, 'SOURCE_JUMP'); } catch {} }
    lastSourceMs = t.sourceMs;
    validTicks++; sessionValid++;
    if (lastArrivalMs) interArrivals.push(at - lastArrivalMs);
    lastArrivalMs = at; lastTickMs = at;
    ledger(raw, at, {...t, symbol:'BTC'});
    try { store.tick(t); } catch {}
    return t;
  }
  async function connectOnce() {
    assertSafeWs(cfg.wsUrl);
    setState(stopped ? 'DISCONNECTED' : reconnects > 0 ? 'RECONNECTING' : 'CONNECTING');
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      try { ws = new WebSocket(cfg.wsUrl); } catch { finish(); return; }
      const openTimer = setTimeout(() => { try { ws?.close(); } catch {} finish(); }, 10000);
      ws.addEventListener('open', () => {
        clearTimeout(openTimer);
        try { sessionId = store.beginSession('crypto-ws', cfg.wsUrl); sessionFrames = 0; sessionValid = 0; } catch { sessionId = null; }
        setState('CONNECTED_UNSUBSCRIBED');
        try { ws.send(JSON.stringify({type:'subscribe', symbols:[SYMBOL]})); setState('SUBSCRIBING'); } catch { finish(); return; }
        // Stale watchdog: 30s silence like production frontend.
        const staleTimer = setInterval(() => {
          if (stopped || ws?.readyState !== WebSocket.OPEN) { clearInterval(staleTimer); return; }
          if (lastMsgMs && Date.now() - lastMsgMs > 30000) { setState('STALE'); try { ws.close(); } catch {} clearInterval(staleTimer); }
        }, 5000);
        ws.addEventListener('close', () => { clearInterval(staleTimer); finish(); }, {once:true});
      });
      ws.addEventListener('message', ev => {
        const at = Date.now();
        lastMsgMs = at; frames++; sessionFrames++;
        let json;
        try { json = JSON.parse(String(ev.data)); } catch { malformed++; try { store.raw('JUPITER_PRICE_WS','ws_frame_malformed',null,at,String(ev.data).slice(0,2000)); } catch {} return; }
        try { store.raw('JUPITER_PRICE_WS','ws_frame',null,at,json); } catch {}
        const dec = decodeFrame(json);
        if (dec.kind === 'subscribed') { setState('LIVE'); return; }
        if (dec.kind === 'snapshot') { for (const x of dec.ticks) ingestTick(x, at); if (validTicks > 0) setState('LIVE'); return; }
        if (dec.kind === 'tick' || dec.kind === 'batch') { for (const x of dec.ticks) ingestTick(x, at); if (state !== 'LIVE' && validTicks > 0) setState('LIVE'); return; }
        if (dec.kind === 'error') { try { store.raw('JUPITER_PRICE_WS','ws_error',null,at,json); } catch {} if (json?.error === 'upstream_connect_failed') { try { ws.close(); } catch {} } return; }
        // unsubscribed etc: retain raw, no ticks.
      });
      ws.addEventListener('error', () => finish());
      ws.addEventListener('close', () => finish(), {once:true});
    });
    try { if (sessionId) store.endSession(sessionId, Date.now(), sessionFrames, sessionValid, state); } catch {}
    sessionId = null;
  }
  async function loop() {
    let backoffMs = 1000;
    while (!stopped) {
      try { await connectOnce(); } catch (e) { logger.warn?.('WS_CONNECT_ERR', String(e?.message || e)); }
      if (stopped) break;
      reconnects++;
      recordHealth();
      setState('RECONNECTING');
      logger.warn?.('WS_RECONNECT_AFTER_MS', backoffMs);
      await sleep(backoffMs);
      backoffMs = Math.min(30000, backoffMs * 2);
      if (backoffMs >= 8000) backoffMs = 1000; // keep bounded; production polls 10s
    }
    setState('DISCONNECTED');
  }
  return {
    start() { stopped = false; setState('CONNECTING'); void loop(); },
    stop() { stopped = true; try { ws?.send(JSON.stringify({type:'unsubscribe_all'})); } catch {} try { ws?.close(); } catch {} setState('DISCONNECTED'); recordHealth(); },
    getState: () => state,
    getMetrics: () => {
      const sorted = [...interArrivals].sort((a,b)=>a-b);
      const q = p => sorted.length ? sorted[Math.min(sorted.length-1, Math.floor(p*sorted.length))] : null;
      return {state, frames, validTicks, duplicates, malformed, gaps, maxGapMs, reconnects, lastTickAgeMs: lastTickMs ? Date.now()-lastTickMs : null, iarP50: q(0.5), iarP90: q(0.9), iarP99: q(0.99)};
    },
    injectRawForTest: (json, at = Date.now()) => { const dec = decodeFrame(json); return dec; },
  };
}
