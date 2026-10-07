// Arcade payout reproduction — frontend-observed formula (arcade bundle 2026-10-07).
// Gross multiplier = totalPool / winningPool; 1.0 if total zero; null if winning side empty.
// Net payout = stake * gross * 0.99 (feeBps 100). On-chain feeAmount semantics UNVERIFIED.
export const FEE_BPS = 100;
export const NET_FACTOR = (10000 - FEE_BPS) / 10000; // 0.99
function toBigIntMicro(v) {
  if (v == null) return null;
  const s = String(v);
  if (!/^\d+$/.test(s)) return null;
  return BigInt(s);
}
export function computeGrossMultiplier({upPool, downPool}, side) {
  const up = toBigIntMicro(upPool), down = toBigIntMicro(downPool);
  if (up == null || down == null) return {multiplier: null, reason: 'BAD_POOL'};
  const total = up + down;
  if (total === 0n) return {multiplier: 1, reason: 'EMPTY_POOL'};
  if (side === 'UP') return up === 0n ? {multiplier: null, reason: 'ONE_SIDED'} : {multiplier: Number(total) / Number(up), reason: 'OK'};
  if (side === 'DOWN') return down === 0n ? {multiplier: null, reason: 'ONE_SIDED'} : {multiplier: Number(total) / Number(down), reason: 'OK'};
  return {multiplier: null, reason: 'BAD_SIDE'};
}
export function computeNetPayout({upPool, downPool, stakeMicro, side}) {
  const stake = toBigIntMicro(stakeMicro);
  if (stake == null || stake <= 0n) return {payoutMicro: null, reason: 'BAD_STAKE'};
  const g = computeGrossMultiplier({upPool, downPool}, side);
  if (g.multiplier == null || g.reason !== 'OK') return {payoutMicro: null, reason: g.reason};
  // Frontend: stake * gross * 0.99 via float; reproduce in integer micro with floor to stay conservative.
  // Use rational 9900/10000 to avoid float drift; floor matches "at most" display.
  const grossScaled = BigInt(Math.floor(Number(stake) * g.multiplier));
  const net = (grossScaled * BigInt(10000 - FEE_BPS)) / BigInt(10000);
  return {payoutMicro: net.toString(), grossMultiplier: g.multiplier, netFactor: NET_FACTOR, reason: 'OK_FRONTEND_FORMULA_ONCHAIN_FEE_UNVERIFIED'};
}
export function computePaperPnL({stakeMicro, payoutMicro, won}) {
  const stake = toBigIntMicro(stakeMicro);
  if (stake == null) return {pnlMicro: null, reason: 'BAD_STAKE'};
  if (won == null) return {pnlMicro: null, reason: 'PENDING'};
  if (!won) return {pnlMicro: (-stake).toString(), reason: 'LOST_STAKE'};
  const pay = toBigIntMicro(payoutMicro);
  if (pay == null) return {pnlMicro: null, reason: 'NO_PAYOUT'};
  return {pnlMicro: (pay - stake).toString(), reason: 'OK_FRONTEND_FORMULA_ONCHAIN_FEE_UNVERIFIED'};
}
