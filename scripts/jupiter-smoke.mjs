// Deployment Jupiter smoke: REST config + current + price + WS ticks + pool + trades.
// Read-only. Prints PASS/FAIL lines, no secrets.
import {getJson} from '../src/http.mjs';
const out = [];
try {
  const c = await getJson('https://prediction-market-api.jup.ag/api/v1/play/config', 8000, fetch);
  out.push(['REST_config', c.roundDurationSeconds === 60 && c.betCutoffSeconds === 5]);
} catch { out.push(['REST_config', false]); }
try {
  const t = await getJson('https://prediction-market-api.jup.ag/api/v1/play/rounds/current', 8000, fetch);
  const btc = [...(t.live||[]), ...(t.bettable||[])].filter(r => r.asset === 'BTC');
  out.push(['rounds_BTC_present', btc.length > 0]);
  const pools = btc.every(r => /^\d+$/.test(r.upPool) && /^\d+$/.test(r.downPool));
  out.push(['pools_integer_strings', pools]);
} catch { out.push(['rounds_BTC_present', false]); out.push(['pools_integer_strings', false]); }
try {
  const now = Math.floor(Date.now()/1000);
  const p = await getJson('https://prediction-market-price-service.fly.dev/price/crypto/btcusdt?timestamp=' + (now-60), 8000, fetch);
  out.push(['price_echo', p.symbol === 'btcusdt' && p.value > 1000]);
} catch { out.push(['price_echo', false]); }
{
  const frames = await new Promise(resolve => {
    let n = 0; const t0 = Date.now();
    try {
      const ws = new WebSocket('wss://prediction-market-price-service.fly.dev/ws/crypto');
      ws.addEventListener('open', () => { try { ws.send(JSON.stringify({type:'subscribe',symbols:['btcusdt']})); } catch {} });
      ws.addEventListener('message', ev => {
        try { const j = JSON.parse(String(ev.data)); if (j.symbol === 'btcusdt' || j.type) n++; } catch {}
        if (n >= 3) { console.log('WS_OK'); try { ws.close(); } catch {} resolve(true); }
      });
      ws.addEventListener('error', () => resolve(false));
      setTimeout(() => { try { ws.close(); } catch {} resolve(n > 0); }, 20000);
    } catch { resolve(false); }
  });
  out.push(['WS_btcusdt_frames', frames]);
}
{
  const trades = await new Promise(resolve => {
    let n = 0;
    try {
      const ws = new WebSocket('wss://prediction-market-price-service.fly.dev/ws/play/trades');
      ws.addEventListener('message', () => { n++; if (n >= 1) { try { ws.close(); } catch {} resolve(true); } });
      ws.addEventListener('error', () => resolve(false));
      setTimeout(() => { try { ws.close(); } catch {} resolve(n > 0); }, 25000);
    } catch { resolve(false); }
  });
  out.push(['trades_stream', trades]);
}
for (const [k, v] of out) console.log((v ? 'PASS' : 'FAIL') + ' ' + k);
process.exit(out.every(([k, v]) => v) ? 0 : 1);
