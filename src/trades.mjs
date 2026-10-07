// Arcade play-trades stream — AGGREGATE ONLY, read-only.
// wss://prediction-market-price-service.fly.dev/ws/play/trades needs NO subscribe.
// Bettor PII (owner/signature/roundAddress) is stripped at ingest; only per-minute
// per-asset side counts + stake sums are retained. No round linkage (no invented mapping).
import {createHash} from 'node:crypto';
import {assertSafeWs} from './http.mjs';
export const TRADES_WS_URL = 'wss://prediction-market-price-service.fly.dev/ws/play/trades';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function shaId(s) { return createHash('sha256').update(String(s)).digest('hex'); }
// Returns {kind:'snapshot'|'trade'|'control'|'malformed', trades:[redacted...]}. Never throws.
export function decodeTradeFrame(json) {
  try {
    if (json && typeof json === 'object' && json.type === 'snapshot' && Array.isArray(json.trades))
      return {kind: 'snapshot', trades: json.trades.map(redactTrade).filter(Boolean)};
    if (json && typeof json === 'object' && json.type === 'trade')
      { const t = redactTrade(json); return t ? {kind:'trade', trades:[t]} : {kind:'malformed', trades:[]}; }
    if (json && typeof json === 'object' && typeof json.type === 'string') return {kind:'control', trades:[]};
    return {kind:'malformed', trades:[]};
  } catch { return {kind:'malformed', trades:[]}; }
}
// Strip owner/signature/roundAddress; keep asset/side/amount/timestamp + id hash.
export function redactTrade(t) {
  if (!t || typeof t !== 'object') return null;
  const asset = String(t.asset ?? '').toUpperCase();
  if (asset !== 'BTC' && asset !== 'SOL') return null;
  const side = String(t.side ?? '').toUpperCase();
  if (side !== 'UP' && side !== 'DOWN') return null;
  const amount = String(t.amount ?? '');
  if (!/^\d+$/.test(amount)) return null;
  const ts = Number(t.timestamp);
  if (!Number.isFinite(ts) || ts < 1e9) return null;
  const tsMs = ts < 1e11 ? ts*1000 : ts;
  return {idHash: shaId(t.id ?? `${asset}${side}${amount}${ts}`), asset, side, amountMicro: amount, tsMs, provenance: 'VENUE_TRADE_AGGREGATE'};
}
export function bucketMinute(tsMs) { return Math.floor(tsMs/60000)*60000; }
export function makeTradesStream(store, logger = console, url = TRADES_WS_URL) {
  let stopped = false, ws = null;
  function saveBatch(trades, at) {
    try {
      store.db.exec(`CREATE TABLE IF NOT EXISTS trade_minute_bars(minute_ms INTEGER NOT NULL, asset TEXT NOT NULL,
        up_count INTEGER NOT NULL DEFAULT 0, down_count INTEGER NOT NULL DEFAULT 0,
        up_stake_micro TEXT NOT NULL DEFAULT '0', down_stake_micro TEXT NOT NULL DEFAULT '0',
        PRIMARY KEY(minute_ms, asset));`);
    } catch {}
    const agg = new Map();
    for (const t of trades) {
      const k = bucketMinute(t.tsMs) + '|' + t.asset;
      if (!agg.has(k)) agg.set(k, {m: bucketMinute(t.tsMs), asset: t.asset, up:0, down:0, upS:0n, downS:0n});
      const a = agg.get(k);
      if (t.side === 'UP') { a.up++; a.upS += BigInt(t.amountMicro); } else { a.down++; a.downS += BigInt(t.amountMicro); }
    }
    for (const a of agg.values()) {
      try {
        store.db.prepare(`INSERT INTO trade_minute_bars(minute_ms,asset,up_count,down_count,up_stake_micro,down_stake_micro)
          VALUES(?,?,?,?,?,?) ON CONFLICT(minute_ms,asset) DO UPDATE SET
          up_count=up_count+excluded.up_count, down_count=down_count+excluded.down_count,
          up_stake_micro=CAST(up_stake_micro AS INTEGER)+CAST(excluded.up_stake_micro AS INTEGER),
          down_stake_micro=CAST(down_stake_micro AS INTEGER)+CAST(excluded.down_stake_micro AS INTEGER)`).run(
          a.m, a.asset, a.up, a.down, String(a.upS), String(a.downS));
        store.raw('JUPITER_PLAY_TRADES', 'minute_bar', a.m, at, {minuteMs: a.m, asset: a.asset, up: a.up, down: a.down});
      } catch {}
    }
    return agg.size;
  }
  async function loop() {
    let backoff = 2000;
    while (!stopped) {
      try {
        assertSafeWs(url);
        await new Promise(resolve => {
          let done = false;
          const fin = () => { if (done) return; done = true; resolve(); };
          try { ws = new WebSocket(url); } catch { fin(); return; }
          const timer = setTimeout(() => { try { ws?.close(); } catch {} fin(); }, 10000);
          ws.addEventListener('open', () => { clearTimeout(timer); try { store.raw('JUPITER_PLAY_TRADES','ws_open',null,Date.now(),{url}); } catch {} });
          ws.addEventListener('message', ev => {
            const at = Date.now();
            let json; try { json = JSON.parse(String(ev.data)); } catch { return; }
            const dec = decodeTradeFrame(json);
            if (dec.trades.length) saveBatch(dec.trades, at);
          });
          ws.addEventListener('error', () => fin());
          ws.addEventListener('close', () => fin(), {once:true});
        });
      } catch (e) { logger.warn?.('TRADES_WS_ERR', String(e?.message || e)); }
      if (stopped) break;
      await sleep(Math.min(30000, backoff));
      backoff = Math.min(30000, backoff*2);
    }
  }
  return {start() { stopped = false; void loop(); }, stop() { stopped = true; try { ws?.close(); } catch {} }, saveBatch, decodeTradeFrame};
}
