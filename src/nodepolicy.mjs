// Frozen node policies — Node Runtime V1.0. Threshold changes => version bump (V1.1+).
// Memory may update every round; THESE RULES may not change without a version bump.
export const NODE_RUNTIME_VERSION = '1.0';
export const POLICY = {
  minSupport: 10,
  pUp: 0.55, pDown: 0.45,
  freshDevWatch: 0.04, freshDevDegraded: 0.08, freshDevStale: 0.15,
  minRecentN: 10,
  noveltyPromoteN: 50, noveltyCandidateN: 100,
};
// Freshness from historical vs recent UP rates + recent support.
export function freshnessClass(histRate, recRate, recentN) {
  if (recentN < POLICY.minRecentN) return 'INSUFFICIENT';
  const dev = Math.abs(recRate - histRate);
  if (dev > POLICY.freshDevStale) return 'STALE';
  if (dev > POLICY.freshDevDegraded) return 'DEGRADED';
  if (dev > POLICY.freshDevWatch) return 'WATCH';
  return 'FRESH';
}
// Drift from centroid distance (standardized units) + outcome deviation.
export function driftClass(centroidDist, outcomeDev) {
  if (centroidDist > 1.0 || outcomeDev > 0.15) return 'HIGH';
  if (centroidDist > 0.5 || outcomeDev > 0.08) return 'MEDIUM';
  return 'LOW';
}
// OOD gate: too far from all pattern centroids => SKIP.
export function oodDecision(dist, radius) { return dist > radius; }
// Lifecycle: deterministic retirement/reactivation. Never on single outcomes;
// only on support/freshness/drift states. History is never deleted (status only).
export function lifecycleStep(status, fresh, gate, drift) {
  if (gate === 'INSUFFICIENT') return 'RETIRED';
  if (fresh === 'STALE') return 'RETIRED';
  if (fresh === 'DEGRADED' || drift === 'HIGH') return status === 'ACTIVE_CANDIDATE' || status === 'ACTIVE' ? 'WATCH' : status;
  if (fresh === 'FRESH' && (status === 'WATCH' || status === 'RETIRED') && (gate === 'STRONG' || gate === 'MEDIUM')) return 'ACTIVE';
  if (status === 'WATCH' && fresh === 'WATCH') return 'WATCH';
  return status === 'RETIRED' ? 'WATCH' : status;
}
// Support gate for acting.
export function supportGate(n) {
  if (n < 10) return 'INSUFFICIENT';
  if (n < 25) return 'VERY_LOW';
  if (n < 50) return 'LOW';
  if (n < 100) return 'MEDIUM';
  return 'STRONG';
}
// Frozen pattern-arm decision: gates first, then .55/.45 policy.
export function patternDecision({ood, fresh, supportN, pUp}) {
  if (ood) return {action: 'SKIP', why: 'ood'};
  if (fresh === 'DEGRADED' || fresh === 'STALE') return {action: 'SKIP', why: 'fresh'};
  if (supportN < POLICY.minSupport) return {action: 'SKIP', why: 'supp'};
  if (pUp == null) return {action: 'SKIP', why: 'abstain'};
  if (pUp >= POLICY.pUp) return {action: 'UP', why: 'policy'};
  if (pUp <= POLICY.pDown) return {action: 'DOWN', why: 'policy'};
  return {action: 'SKIP', why: 'abstain'};
}
