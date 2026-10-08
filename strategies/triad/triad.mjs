// TRIAD Regime System — pure price-action strategies for 60s BTC prediction.
// Zero model calls. All decisions use data available at T-6s (no lookahead).
//
// Detectors:
//   storm-SD: high-vol downward momentum -> DOWN
//   sky-SU:   high-vol upward momentum -> UP  
//   calm-CS:  low-vol regime flag -> always SKIP (it's a signal, not a bet)
// Router:
//   triad-TD: unified (calm > conflict > storm > sky > skip)
//   triad-HR: high-risk variant with looser thresholds
//   kalman-KF: Kalman-filtered momentum version

export function priceAt(tsMs, ticks) {
  let lo = 0, hi = ticks.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid].source_ms <= tsMs) { best = ticks[mid].price; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}

export function microVol(D, ticks) {
  const vols = [];
  for (let s = 0; s < 60; s++) {
    const pa = priceAt(D - s * 1000, ticks), pb = priceAt(D - (s + 1) * 1000, ticks);
    if (pa != null && pb != null && pb > 0) vols.push(Math.abs(pa - pb) / pb * 10000);
  }
  if (vols.length < 30) return null;
  return vols.reduce((x, y) => x + y, 0) / vols.length;
}

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Returns {storm, sky, calm} — the three regime detectors
export function triadSignals(startMs, ticks, volHistory) {
  const out = { storm: false, sky: false, calm: false };
  if (typeof startMs !== 'number' || !ticks || !ticks.length) return out;
  const D = startMs - 6000;
  const pD = priceAt(D, ticks), pD60 = priceAt(D - 60000, ticks);
  if (!Number.isFinite(pD) || !Number.isFinite(pD60)) return out;
  const moBps = (pD - pD60) / pD60 * 10000;
  const volNow = microVol(D, ticks);
  if (volNow === null) return out;
  const med = volHistory.length >= 10 ? median(volHistory) : null;
  if (med === null) return out;
  const pA = priceAt(startMs - 15000, ticks);
  const pushBps = pA != null ? (pD - pA) / pA * 10000 : null;
  if (volNow < med * 0.7) out.calm = true;
  else {
    if (moBps <= -3.0 && volNow >= med && (pushBps === null || pushBps < 0)) out.storm = true;
    if (moBps >= 3.0 && volNow >= med && (pushBps === null || pushBps > 0)) out.sky = true;
  }
  return out;
}

// Unified router: calm > conflict > storm > sky > skip
export function triadDecide(startMs, ticks, volHistory) {
  const s = triadSignals(startMs, ticks, volHistory);
  if (s.calm) return { action: 'SKIP', p_up: 0.5, note: 'calm-skip' };
  if (s.storm && s.sky) return { action: 'SKIP', p_up: null, note: 'conflict-skip' };
  if (s.storm) return { action: 'DOWN', p_up: 0.35, note: 'storm-down' };
  if (s.sky) return { action: 'UP', p_up: 0.65, note: 'sky-up' };
  return { action: 'SKIP', p_up: null, note: 'no-signal' };
}

// High-risk variant: looser thresholds, more bets
export function triadHRDecide(startMs, ticks, volHistory) {
  if (typeof startMs !== 'number' || !ticks || !ticks.length) return { action: 'SKIP', p_up: null, note: 'no-data' };
  const D = startMs - 6000;
  const pD = priceAt(D, ticks), pD60 = priceAt(D - 60000, ticks);
  if (!Number.isFinite(pD) || !Number.isFinite(pD60)) return { action: 'SKIP', p_up: null, note: 'no-data' };
  const moBps = (pD - pD60) / pD60 * 10000;
  const volNow = microVol(D, ticks);
  if (volNow === null) return { action: 'SKIP', p_up: null, note: 'no-vol' };
  const med = volHistory.length >= 10 ? median(volHistory) : null;
  if (med === null) return { action: 'SKIP', p_up: null, note: 'warmup' };
  const isCalm = volNow < med * 0.5;
  const isStorm = !isCalm && moBps <= -2.0 && volNow >= med * 0.8;
  const isSky = !isCalm && moBps >= 2.0 && volNow >= med * 0.8;
  if (isCalm) return { action: 'SKIP', p_up: null, note: 'calm-skip' };
  if (isStorm && isSky) return { action: 'SKIP', p_up: null, note: 'conflict' };
  if (isStorm) return { action: 'DOWN', p_up: 0.40, note: 'storm-hr' };
  if (isSky) return { action: 'UP', p_up: 0.60, note: 'sky-hr' };
  return { action: 'SKIP', p_up: null, note: 'skip' };
}

// Kalman-filtered version: momentum from Kalman velocity, not raw diffs
export function kalmanDecide(startMs, ticks, volHistory) {
  if (typeof startMs !== 'number' || !ticks || ticks.length < 20) return { action: 'SKIP', p_up: null, note: 'no-data' };
  const D = startMs - 6000;
  // 1D Kalman filter over 60s window
  let x = null, v = 0, pX = 1, pV = 1;
  const q = 0.05, r = 2.0;
  let lastT = null;
  const win = ticks.filter(t => t.source_ms <= D && t.source_ms > D - 65000).sort((a, b) => a.source_ms - b.source_ms);
  if (win.length < 20) return { action: 'SKIP', p_up: null, note: 'thin' };
  for (const t of win) {
    if (x === null) { x = t.price; lastT = t.source_ms; continue; }
    const dt = Math.max(0.1, (t.source_ms - lastT) / 1000);
    x += v * dt / 10000 * x; pX += pV * dt * dt + q; pV += q * 0.1;
    const k = pX / (pX + r);
    const innov = t.price - x;
    x += k * innov;
    v += (k * innov / x * 10000) / Math.max(dt, 0.5) * 0.3;
    pX *= (1 - k);
    lastT = t.source_ms;
  }
  const kfMoBps = v * 60;
  const volNow = microVol(D, ticks);
  if (volNow === null) return { action: 'SKIP', p_up: null, note: 'no-vol' };
  const med = volHistory.length >= 10 ? median(volHistory) : null;
  if (med === null) return { action: 'SKIP', p_up: null, note: 'warmup' };
  const pA = priceAt(startMs - 15000, ticks);
  const pDv = priceAt(D, ticks);
  const pushBps = (pA != null && pDv != null) ? (pDv - pA) / pA * 10000 : null;
  if (volNow < med * 0.7) return { action: 'SKIP', p_up: 0.5, note: 'kf-calm' };
  if (kfMoBps <= -3.0 && volNow >= med && (pushBps === null || pushBps < 0)) return { action: 'DOWN', p_up: 0.35, note: 'kf-storm' };
  if (kfMoBps >= 3.0 && volNow >= med && (pushBps === null || pushBps > 0)) return { action: 'UP', p_up: 0.65, note: 'kf-sky' };
  return { action: 'SKIP', p_up: null, note: 'kf-skip' };
}
