import fs from 'node:fs';
import path from 'node:path';

// Minimal safe env loader: no third-party dependency, no interpolation or shell eval.
export function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[m[1]] = value;
  }
}
export function config(env = process.env) {
  const num = (k, d) => { const v = env[k] ? Number(env[k]) : d; if (!Number.isFinite(v)) throw new Error(`INVALID_ENV_NUMERIC:${k}`); return v; };
  const cfg = {
    dataDir: path.resolve(env.DATA_DIR || './var'),
    openaiKey: env.OPENAI_API_KEY || '', typesafeKey: env.TYPESAFE_API_KEY || '', fastinoKey: env.FASTINO_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-6-luna', typesafeModel: env.TYPESAFE_MODEL || 'jev-latest', fastinoModel: env.FASTINO_MODEL || 'fastino/GLiDE',
    roundsUrl: env.JUPITER_ROUNDS_URL || 'https://prediction-market-api.jup.ag/api/v1/play/rounds?asset=BTC&before=5&after=1',
    roundsCurrentUrl: env.JUPITER_ROUNDS_CURRENT_URL || 'https://prediction-market-api.jup.ag/api/v1/play/rounds/current',
    venueBetCutoffMs: num('JUPITER_BET_CUTOFF_MS', 5000),
    wsUrl: env.JUPITER_PRICE_WS_URL || 'wss://prediction-market-price-service.fly.dev/ws/crypto',
    wsSubscribe: env.JUPITER_PRICE_WS_SUBSCRIBE_JSON || '',
    openapiUrl: env.JUPITER_OPENAPI_URL || 'https://prediction-market-api.jup.ag/openapi.json',
    restPollMs: num('JUPITER_REST_POLL_MS', 2000),
    beforeMs: num('PREDICTION_BEFORE_OPEN_MS', 10000), bufferMs: num('PAPER_LOCK_BUFFER_MS', 3000),
    requestTimeoutMs: num('REQUEST_TIMEOUT_MS', 4500), maxPriceAgeMs: num('MAX_PRICE_AGE_MS', 2500),
    stake: num('PAPER_STAKE_USDC', 10), upThreshold: num('PAPER_PROB_UP', .57), downThreshold: num('PAPER_PROB_DOWN', .43),
    maxCalls: num('MAX_MODEL_CALLS_PER_SESSION', 3000), maxArmCalls: num('MAX_MODEL_CALLS_PER_ARM', 1000),
    dashboardPort: num('DASHBOARD_PORT', 8789)
  };
  if (!(cfg.upThreshold > .5 && cfg.upThreshold <= 1 && cfg.downThreshold >= 0 && cfg.downThreshold < .5 && cfg.downThreshold < cfg.upThreshold)) throw new Error('INVALID_THRESHOLDS');
  if (!(cfg.restPollMs >= 1000 && cfg.beforeMs > cfg.bufferMs + 1000 && cfg.requestTimeoutMs > 100 && cfg.stake > 0 && cfg.maxCalls >= 0 && cfg.maxArmCalls >= 0)) throw new Error('UNSAFE_CONFIG');
  return cfg;
}
