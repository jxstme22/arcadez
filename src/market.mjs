import {createHash} from 'node:crypto';
export function sha(value) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
export function parseEpochMs(x) {
  if (x == null || x === '') return null;
  if (typeof x === 'string' && /\d{4}-\d{2}-\d{2}T/.test(x)) { const t = Date.parse(x); return Number.isFinite(t) ? t : null; }
  const n = Number(x); if (!Number.isFinite(n) || n < 1e9) return null;
  const t = n < 1e11 ? n * 1000 : n; return t;
}
export function parseMicro(raw) {
  if (raw == null || typeof raw === 'boolean') return null;
  const s = String(raw); if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const [integral, dec = ''] = s.split('.');
  // BTC prices in cents/dollars are ambiguous unless marked; >1e9 is microUSD.
  if (BigInt(integral) >= 1000000000n && !dec) return integral;
  if (BigInt(integral) < 1000n || BigInt(integral) > 1000000n) return null;
  return String(BigInt(integral) * 1000000n + BigInt((dec + '000000').slice(0,6)));
}
const first = (x,keys) => keys.map(k=>x?.[k]).find(v=>v!==undefined&&v!==null);
function parsePoolMicro(v) {
  if (v == null) return null;
  const s = String(v);
  if (!/^\d+$/.test(s)) return null;
  return s;
}
export function normalizeRound(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawId = first(raw,['roundId','id','round_id','slug']);
  const symbolField = first(raw,['symbol','asset','ticker','market']);
  const sym = symbolField == null ? '' : String(symbolField).toLowerCase();
  // Do not silently classify unlabeled SOL or other markets as BTC.
  if (sym ? !/btc/.test(sym) : !/^btc(?:[-_]|$)/i.test(String(rawId||''))) return null;
  const start = parseEpochMs(first(raw,['openTs','startTs','openTime','startTime','start_ts','startMs']));
  const end = parseEpochMs(first(raw,['closeTs','endTs','closeTime','endTime','end_ts','endMs'])) || (start == null ? null : start + 60000);
  const open = parseMicro(first(raw,['openPrice','open_price','openPriceMicro','open_price_micro']));
  const close = parseMicro(first(raw,['closePrice','close_price','closePriceMicro','close_price_micro']));
  if (start == null || end-start!==60000 || rawId == null) return null;
  // Verified Jupiter PlayRound 2026-10-07: status betting|locked|live|resolving|settled|voided (may be null for far-future),
  // outcome UNRESOLVED|UP|DOWN|VOID (may be null). Prices scaled 1e6 strings. Pools in USDC base units.
  const venueStatus = raw?.status == null ? null : String(raw.status).toLowerCase();
  const venueOutcome = raw?.outcome == null ? null : String(raw.outcome).toUpperCase();
  const status = String(first(raw,['status','result','outcome']) || '').toUpperCase();
  const refund = status==='VOID' || status==='REFUNDED' || status==='REFUND' || venueStatus==='voided' || venueOutcome==='VOID';
  const priceDirection = refund ? 'VOID' : open!=null&&close!=null?(BigInt(close)>BigInt(open)?'UP':BigInt(close)<BigInt(open)?'DOWN':'VOID'):null;
  const explicitWinner=String(first(raw,['winner','winningSide','winning_side']) || '').toUpperCase();
  // A schema inconsistency is not a chance to pick the label that looks most favorable.
  if (explicitWinner && ['UP','DOWN','VOID'].includes(explicitWinner) && priceDirection && explicitWinner!==priceDirection) return null;
  // Venue outcome is authoritative. UNRESOLVED/null means pending even if prices partially present.
  // Settled UP/DOWN must agree with exact micro price comparison; otherwise fail closed.
  let result = priceDirection;
  const isVoidStatus = venueStatus === 'voided' || venueStatus === 'void';
  if (venueOutcome === 'VOID' || isVoidStatus || refund) result = 'VOID';
  else if (venueOutcome === 'UP' || venueOutcome === 'DOWN') {
    if (priceDirection == null) return null;
    if (priceDirection !== venueOutcome) return null;
    result = venueOutcome;
  } else if (venueOutcome === 'UNRESOLVED' || venueOutcome == null) {
    // Live/betting/future rounds are pending. Only settled/voided carry a label.
    // Legacy synthetic shapes with no venue fields fall back to price direction for unit tests.
    if (venueStatus == null && venueOutcome == null) result = priceDirection;
    else if (venueStatus !== 'settled' && !isVoidStatus) result = null;
    else if (priceDirection == null) result = null;
  }
  // Equal open==close is venue VOID per priceDirection; keep as VOID only if venue agrees or is settled.
  const upPoolMicro = parsePoolMicro(first(raw,['upPool','up_pool']));
  const downPoolMicro = parsePoolMicro(first(raw,['downPool','down_pool']));
  const feeMicro = parsePoolMicro(first(raw,['feeAmount','fee_amount','fee']));
  const openObsMs = parseEpochMs(first(raw,['openObservationTs','open_observation_ts','openObservationMs']));
  const closeObsMs = parseEpochMs(first(raw,['closeObservationTs','close_observation_ts','closeObservationMs']));
  // Round id is venue supplied. No phantom rounds synthesized from price history.
  return {id:String(rawId), symbol:'BTC', startMs:start,endMs:end,openMicro:open,closeMicro:close,result,
    venueStatus,venueOutcome,upPoolMicro,downPoolMicro,feeMicro,openObsMs,closeObsMs,raw};
}
export function extractRounds(json) {
  if (Array.isArray(json)) return json.map(normalizeRound).filter(Boolean);
  // Verified shapes 2026-10-07: {data:[PlayRound],serverTime}, {live:[],bettable:[]}, single PlayRound {id,asset,openTs,...}
  // Current endpoint carries both live and bettable; combine, do not drop bettable.
  if (Array.isArray(json?.live) || Array.isArray(json?.bettable)) {
    const combined = [...(Array.isArray(json?.live)?json.live:[]),...(Array.isArray(json?.bettable)?json.bettable:[])];
    return combined.map(normalizeRound).filter(Boolean);
  }
  const listCandidates = [json?.rounds,json?.data?.rounds,json?.data?.items,json?.items,json?.data].find(Array.isArray);
  if (Array.isArray(listCandidates)) return listCandidates.map(normalizeRound).filter(Boolean);
  // Single-round GET /play/rounds/{asset}/{openTs} returns one PlayRound object.
  if (json && typeof json === 'object' && typeof json.id === 'string' && (json.openTs != null || json.openTs === 0)) {
    const one = normalizeRound(json);
    return one ? [one] : [];
  }
  return [];
}
export function normalizeTick(raw, receivedMs) {
  const inner = raw?.data && typeof raw.data==='object' && !Array.isArray(raw.data)? raw.data:raw;
  if (!inner || typeof inner!=='object') return null;
  const sym=String(first(inner,['symbol','ticker','pair','asset']) || '').toLowerCase();
  if (!['btcusdt','btc-usd','btcusd','btc'].includes(sym)) return null;
  const price=Number(first(inner,['price','value','lastPrice','last_price']));
  if (!Number.isFinite(price) || price < 1000 || price > 1000000) return null;
  const sourceMs=parseEpochMs(first(inner,['timestamp','ts','time','sourceTs']));
  if (sourceMs == null || sourceMs > receivedMs + 200 || receivedMs - sourceMs > 10000) return null;
  return {symbol:'BTC',price,sourceMs,receivedMs, provenance:'LIVE_RECEIVED_WS',raw};
}
const bps = (p,old)=> +(10000*(p/old-1)).toFixed(5);
export function featuresAsOf(ticks, asOf, maxAge = 2500) {
  const good = ticks.filter(x=>x.provenance==='LIVE_RECEIVED_WS' && x.sourceMs <= x.receivedMs+200 && x.sourceMs <= asOf && x.receivedMs <= asOf && x.receivedMs >= asOf-121000).sort((a,b)=>a.receivedMs-b.receivedMs);
  const last=good.at(-1); if(!last || asOf-last.receivedMs>maxAge || good.filter(x=>x.receivedMs>=asOf-60000).length<8) return null;
  const previous = (sec)=> {const p=good.filter(x=>x.receivedMs<=asOf-sec*1000).at(-1);return p&&asOf-sec*1000-p.receivedMs<=maxAge ? p.price : null;};
  const ret={}; for(const sec of [1,5,15,30,60]){const p=previous(sec);ret[`return_${sec}s_bps`]=p==null?null:bps(last.price,p);}
  const lastMinute=good.filter(x=>x.receivedMs>=asOf-60000);
  const values=lastMinute.slice(1).map((x,i)=>bps(x.price,lastMinute[i].price));
  const variance=values.length>1?values.reduce((s,v)=>s+v*v,0)/values.length:0;
  let flips=0;let prior=0;for (const v of values){let dir=Math.sign(v);if(dir&&prior&&dir!==prior)flips++;if(dir)prior=dir;}
  return {last_price_usd:last.price,price_age_ms:asOf-last.receivedMs,latest_source_age_ms:asOf-last.sourceMs,
    sample_count_60s:lastMinute.length,observed_returns_bps:ret,realized_volatility_sample_bps:+Math.sqrt(variance).toFixed(5),direction_flips_60s:flips,
    last_received_at_ms:last.receivedMs};
}
export function nextRound(rounds,now) {return rounds.filter(r=>r.startMs>now&&r.startMs<=now+120000).sort((a,b)=>a.startMs-b.startMs)[0]||null;}
