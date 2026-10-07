import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProviderResult} from '../src/models.mjs';

test('normalize maps OK to VALID with identity probability (no inversion)', () => {
  const n = normalizeProviderResult('openai', {roundId:'r', arm:'openai', status:'OK', pUp:0.72, action:'UP', sentMs:1000, receivedMs:1100, model:'gpt-6-luna', snapshotHash:'h', errorCode:null});
  assert.equal(n.provider, 'OPENAI_DECISIONS');
  assert.equal(n.status, 'VALID');
  assert.equal(n.raw_probability_up, 0.72);
  assert.equal(n.normalized_probability_up, 0.72);
  assert.equal(n.decision, 'UP');
  assert.equal(n.latency_ms, 100);
  assert.equal(n.input_hash, 'h');
});
test('provider tags are independent (no cross-contamination)', () => {
  assert.equal(normalizeProviderResult('jev', {status:'OK', pUp:.5, action:'SKIP'}).provider, 'JEV');
  assert.equal(normalizeProviderResult('glide', {status:'OK', pUp:.3, action:'DOWN'}).provider, 'GLIDE');
});
test('late and missed lock map to LATE', () => {
  assert.equal(normalizeProviderResult('jev', {status:'LATE', action:'SKIP'}).status, 'LATE');
  assert.equal(normalizeProviderResult('jev', {status:'MISSED_LOCK', action:'SKIP'}).status, 'LATE');
});
test('auth errors map to AUTH_ERROR (401/402/403/404), never retried', () => {
  for (const code of ['MODEL_HTTP_401','MODEL_HTTP_402','MODEL_HTTP_403','MODEL_HTTP_404']) {
    assert.equal(normalizeProviderResult('glide', {status:'ERROR', errorCode:code, action:'SKIP'}).status, 'AUTH_ERROR');
  }
});
test('rate-limit family maps to RATE_LIMITED (425/429/503/529)', () => {
  for (const code of ['MODEL_HTTP_429','MODEL_HTTP_529','MODEL_HTTP_425','MODEL_HTTP_503']) {
    assert.equal(normalizeProviderResult('jev', {status:'ERROR', errorCode:code, action:'SKIP'}).status, 'RATE_LIMITED');
  }
});
test('timeout and malformed map distinctly', () => {
  assert.equal(normalizeProviderResult('openai', {status:'ERROR', errorCode:'TIMEOUT', action:'SKIP'}).status, 'TIMEOUT');
  assert.equal(normalizeProviderResult('jev', {status:'ERROR', errorCode:'BAD_PROBABILITY', action:'SKIP'}).status, 'MALFORMED');
  assert.equal(normalizeProviderResult('jev', {status:'ERROR', errorCode:'MISSING_OR_REFUSAL', action:'SKIP'}).status, 'MALFORMED');
  assert.equal(normalizeProviderResult('glide', {status:'ERROR', errorCode:'MODEL_HTTP_422', action:'SKIP'}).status, 'MALFORMED');
});
test('disabled arms map to UNAVAILABLE', () => {
  assert.equal(normalizeProviderResult('openai', {status:'DISABLED_MISSING_KEY', action:'SKIP'}).status, 'UNAVAILABLE');
  assert.equal(normalizeProviderResult('jev', {status:'DISABLED_BUDGET', action:'SKIP'}).status, 'UNAVAILABLE');
});
test('GLiDE noul is directional P(UP); confidence never decoded (inversion-proof)', async () => {
  const {parseAnswer} = await import('../src/models.mjs');
  assert.equal(parseAnswer('glide', {answers:{next_btc_arcade_up:{type:'noul', noul:0.7, confidence:0.4}}}).pUp, 0.7);
  assert.equal(parseAnswer('glide', {answers:{next_btc_arcade_up:{type:'noul', noul:0.3, confidence:0.4}}}).pUp, 0.3);
  assert.equal(parseAnswer('glide', {answers:{next_btc_arcade_up:{type:'noul', noul:0.5, confidence:0.0}}}).pUp, 0.5);
  assert.throws(() => parseAnswer('glide', {answers:{next_btc_arcade_up:{type:'noul', confidence:0.7}}}), /BAD_PROBABILITY|MISSING_OR_REFUSAL/);
  assert.throws(() => parseAnswer('glide', {answers:{next_btc_arcade_up:{type:'noul', noul:1.2}}}), /BAD_PROBABILITY/);
  assert.throws(() => parseAnswer('glide', {answers:{next_btc_arcade_up:{type:'noul', noul:-0.1}}}), /BAD_PROBABILITY/);
  assert.throws(() => parseAnswer('glide', {answers:{next_btc_arcade_up:{type:'choice', choice:'UP'}}}), /MISSING_OR_REFUSAL/);
  assert.throws(() => parseAnswer('glide', {answers:{}}), /MISSING_OR_REFUSAL/);
});
