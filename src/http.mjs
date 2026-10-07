export const TRUSTED = {
  openai: 'https://api.openai.com/v1/decisions',
  typesafe: 'https://api.typesafe.ai/v1/systemone',
  fastino: 'https://api.fastino.ai/v1/systemone'
};
export function assertSafeJupiterUrl(input) {
  const u = new URL(input);
  if (u.protocol !== 'https:' || !['prediction-market-api.jup.ag', 'prediction-market-price-service.fly.dev'].includes(u.hostname)) throw new Error('UNTRUSTED_JUPITER_HOST');
  if (u.hostname === 'prediction-market-api.jup.ag' && !((u.pathname.startsWith('/api/v1/play/') && !/order|execute|bet|withdraw|deposit|claim|sign|transaction/i.test(u.pathname)) || u.pathname === '/openapi.json')) throw new Error('UNSAFE_JUPITER_ROUTE');
  if (u.hostname === 'prediction-market-price-service.fly.dev' && !u.pathname.startsWith('/price/crypto/')) throw new Error('UNSAFE_JUPITER_PRICE_ROUTE');
  return u;
}
export function assertSafeWs(input) {
  const u = new URL(input);
  if (u.protocol !== 'wss:' || u.hostname !== 'prediction-market-price-service.fly.dev') throw new Error('UNTRUSTED_WS_URL');
  if (u.pathname !== '/ws/crypto' && u.pathname !== '/ws/play/trades') throw new Error('UNTRUSTED_WS_URL');
  return u;
}
export async function getJson(url, timeoutMs = 5000, transport = fetch) {
  assertSafeJupiterUrl(url);
  const res = await transport(url, {method:'GET',headers:{accept:'application/json'}, signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
  if (!res.ok) throw new Error(`JUPITER_HTTP_${res.status}`);
  const text = await res.text(); if (text.length > 5_000_000) throw new Error('JUPITER_RESPONSE_TOO_LARGE');
  return JSON.parse(text);
}
export async function postJson(url, apiKey, data, timeoutMs = 4500, transport = fetch) {
  if (!Object.values(TRUSTED).includes(url)) throw new Error('UNTRUSTED_PROVIDER_URL');
  const headers = {'Content-Type':'application/json', 'Accept':'application/json'};
  if (url === TRUSTED.fastino) headers['X-API-Key'] = apiKey;
  else headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await transport(url, { method:'POST', headers, body:JSON.stringify(data), signal:AbortSignal.timeout(timeoutMs), redirect:'error'});
  const reply = await res.text();
  if (!res.ok) throw new Error(`MODEL_HTTP_${res.status}`);
  if (reply.length > 200_000) throw new Error('MODEL_RESPONSE_TOO_LARGE');
  return JSON.parse(reply);
}
