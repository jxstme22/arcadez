import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeRound, extractRounds} from '../src/market.mjs';
import {venueLockMs} from '../src/paper.mjs';
import {Store} from '../src/store.mjs';

const timeline = JSON.parse(fs.readFileSync(new URL('../research/fixtures/jupiter.play.timeline.20261007.json', import.meta.url))).payload;
const single = {id:'btc-1791345660', asset:'BTC', openTs:1791345660, closeTs:1791345720, status:'settled', outcome:'UP', upPool:'65420000', downPool:'52000000', feeAmount:'240871', openPrice:'84138141522', closePrice:'84162410047', openObservationTs:1791345660, closeObservationTs:1791345720};

test('verified timeline decodes settled labels and pending live/future', () => {
  const rounds = extractRounds(timeline);
  // 5 settled with labels + live pending + future null-status pending = 7 raw, 7 normalized (pending included)
  assert.equal(rounds.length, 7);
  const settled = rounds.filter(r => r.result === 'UP' || r.result === 'DOWN');
  assert.equal(settled.length, 5);
  const live = rounds.find(r => r.id === 'btc-1791345780');
  assert.equal(live.result, null);
  assert.equal(live.venueStatus, 'live');
  assert.equal(live.openMicro, '84161561956');
  assert.equal(live.closeMicro, null);
  const future = rounds.find(r => r.id === 'btc-1791345840');
  assert.equal(future.result, null);
  assert.ok(future.startMs + 60000 === future.endMs);
});

test('venue outcome mismatch fails closed, VOID authoritative', () => {
  const mismatch = normalizeRound({...single, outcome:'DOWN'});
  assert.equal(mismatch, null);
  const voided = normalizeRound({...single, status:'voided', outcome:'VOID'});
  assert.equal(voided.result, 'VOID');
  const unresolvedLive = normalizeRound({...single, status:'live', outcome:'UNRESOLVED', closePrice:null});
  assert.equal(unresolvedLive.result, null);
});

test('extractRounds handles current live+bettable and single-round GET', () => {
  const current = {serverTime:1791345754, live:[single], bettable:[{...single, id:'btc-1791345780', openTs:1791345780, closeTs:1791345840, status:'betting', outcome:'UNRESOLVED', openPrice:null, closePrice:null}]};
  const arr = extractRounds(current);
  assert.equal(arr.length, 2);
  assert.equal(extractRounds(single).length, 1);
  assert.equal(extractRounds({data:[single], serverTime:1}).length, 1);
});

test('venue lock respects 5s on-chain cutoff plus buffer', () => {
  const cfg = {bufferMs:3000, venueBetCutoffMs:5000};
  const round = {startMs:1791345780000};
  assert.equal(venueLockMs(round, cfg), 1791345780000 - 6000);
  const cfg2 = {bufferMs:8000, venueBetCutoffMs:5000};
  assert.equal(venueLockMs(cfg2 && round, cfg2), 1791345780000 - 8000);
});

test('pool observation stored separately, PnL stays NULL until verified odds', () => {
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(),'arcade-pool-')));
  const r = normalizeRound(single);
  s.round(r, Date.now());
  s.poolObservation(r, Date.now());
  const pools = s.db.prepare('SELECT COUNT(*) AS n FROM pool_observations').get();
  assert.equal(pools.n, 1);
  s.saveDecision({roundId:r.id, arm:'openai', status:'OK', pUp:0.7, action:'UP'}, 10);
  s.settle(r.id, 'UP');
  const row = s.db.prepare('SELECT pnl_usdc, pnl_status FROM paper').get();
  assert.equal(row.pnl_usdc, null);
  assert.match(row.pnl_status, /UNAVAILABLE/);
  s.close();
});

test('SOL rounds never decode as BTC even with valid venue shape', () => {
  const sol = {...single, id:'sol-1791345660', asset:'SOL'};
  assert.equal(normalizeRound(sol), null);
});
