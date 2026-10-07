import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {sha} from './market.mjs';

export class Store {
  constructor(dir) {
    fs.mkdirSync(dir,{recursive:true,mode:0o700});this.dir=dir;
    this.db=new DatabaseSync(path.join(dir,'arcade.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS raw_events(id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, kind TEXT NOT NULL,
      source_ms INTEGER, received_ms INTEGER NOT NULL, sha TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_events_received ON raw_events(received_ms);
    CREATE TABLE IF NOT EXISTS ticks(id INTEGER PRIMARY KEY AUTOINCREMENT, price REAL NOT NULL,
      source_ms INTEGER NOT NULL, received_ms INTEGER NOT NULL, provenance TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_ticks_received ON ticks(received_ms);
    CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
      open_micro TEXT, close_micro TEXT, result TEXT, first_seen_ms INTEGER NOT NULL, last_seen_ms INTEGER NOT NULL, raw TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots(round_id TEXT PRIMARY KEY, as_of_ms INTEGER NOT NULL, hash TEXT NOT NULL,
      snapshot TEXT NOT NULL, provenance TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS decisions(round_id TEXT NOT NULL, arm TEXT NOT NULL, status TEXT NOT NULL,
      p_up REAL, action TEXT NOT NULL, sent_ms INTEGER, received_ms INTEGER,
      model TEXT, error_code TEXT, snapshot_sha TEXT, answer TEXT, usage TEXT,
      PRIMARY KEY(round_id,arm));
    CREATE TABLE IF NOT EXISTS paper(round_id TEXT NOT NULL, arm TEXT NOT NULL,
      action TEXT NOT NULL, stake_usdc REAL NOT NULL, result TEXT, correct INTEGER,
      pnl_usdc REAL, pnl_status TEXT NOT NULL DEFAULT 'UNAVAILABLE_NO_VERIFIED_ODDS',
      PRIMARY KEY(round_id,arm));
    CREATE TABLE IF NOT EXISTS evidence(key TEXT PRIMARY KEY, captured_ms INTEGER NOT NULL, sha TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pool_observations(round_id TEXT NOT NULL, observed_ms INTEGER NOT NULL,
      up_pool_micro TEXT, down_pool_micro TEXT, fee_micro TEXT, venue_status TEXT, venue_outcome TEXT, sha TEXT NOT NULL,
      PRIMARY KEY(round_id, observed_ms));
    CREATE TABLE IF NOT EXISTS historical_rounds(id TEXT PRIMARY KEY, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
      open_micro TEXT, close_micro TEXT, result TEXT, retrieved_ms INTEGER NOT NULL,
      provenance TEXT NOT NULL,
      raw TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS historical_prices(source_ts_ms INTEGER PRIMARY KEY,
      queried_at_ms INTEGER NOT NULL, received_at_ms INTEGER NOT NULL, price_usd REAL NOT NULL, raw_sha TEXT NOT NULL,
      provenance TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stream_sessions(id TEXT PRIMARY KEY, kind TEXT NOT NULL, url TEXT NOT NULL,
      connected_ms INTEGER NOT NULL, ended_ms INTEGER, frames INTEGER NOT NULL DEFAULT 0,
      valid_ticks INTEGER NOT NULL DEFAULT 0, note TEXT);
    CREATE TABLE IF NOT EXISTS stream_gaps(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT,
      gap_start_ms INTEGER NOT NULL, gap_end_ms INTEGER NOT NULL, gap_ms INTEGER NOT NULL, reason TEXT);
    CREATE TABLE IF NOT EXISTS raw_btc_ticks(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT,
      raw_json TEXT NOT NULL, symbol TEXT, price REAL, source_ts_ms INTEGER, receive_ts_ms INTEGER NOT NULL,
      ingest_ts_ms INTEGER NOT NULL, gap_before_ms INTEGER, duplicate INTEGER NOT NULL DEFAULT 0,
      valid INTEGER NOT NULL DEFAULT 1, invalid_reason TEXT, collector_version TEXT, schema_version TEXT, provenance TEXT);
    CREATE INDEX IF NOT EXISTS idx_rawticks_source ON raw_btc_ticks(source_ts_ms);
    CREATE TABLE IF NOT EXISTS round_state_observations(round_id TEXT NOT NULL, observed_ms INTEGER NOT NULL,
      venue_status TEXT, venue_outcome TEXT, up_pool_micro TEXT, down_pool_micro TEXT,
      open_micro TEXT, close_micro TEXT, sha TEXT NOT NULL,
      PRIMARY KEY(round_id, observed_ms));
    CREATE TABLE IF NOT EXISTS dataset_versions(version TEXT PRIMARY KEY, created_ms INTEGER NOT NULL,
      spec TEXT NOT NULL, sha TEXT NOT NULL);`);
  }
  poolObservation(r,seen=Date.now()){const payload=JSON.stringify({up:r.upPoolMicro,down:r.downPoolMicro,fee:r.feeMicro,status:r.venueStatus,outcome:r.venueOutcome});this.db.prepare('INSERT OR IGNORE INTO pool_observations(round_id,observed_ms,up_pool_micro,down_pool_micro,fee_micro,venue_status,venue_outcome,sha) VALUES(?,?,?,?,?,?,?,?)').run(r.id,seen,r.upPoolMicro??null,r.downPoolMicro??null,r.feeMicro??null,r.venueStatus??null,r.venueOutcome??null,sha(payload));}
  beginSession(kind,url,at=Date.now()){const id=`${kind}_${at}_${Math.floor(Math.random()*1e6)}`;this.db.prepare('INSERT INTO stream_sessions(id,kind,url,connected_ms,frames,valid_ticks) VALUES(?,?,?,?,0,0)').run(id,kind,url,at);return id;}
  endSession(id,at=Date.now(),frames=0,valid=0,note=null){this.db.prepare('UPDATE stream_sessions SET ended_ms=?,frames=?,valid_ticks=?,note=? WHERE id=?').run(at,frames,valid,note,id);}
  recordGap(sessionId,startMs,endMs,reason){this.db.prepare('INSERT INTO stream_gaps(session_id,gap_start_ms,gap_end_ms,gap_ms,reason) VALUES(?,?,?,?,?)').run(sessionId,startMs,endMs,endMs-startMs,reason);}
  saveRawTick(m){this.db.prepare('INSERT INTO raw_btc_ticks(session_id,raw_json,symbol,price,source_ts_ms,receive_ts_ms,ingest_ts_ms,gap_before_ms,duplicate,valid,invalid_reason,collector_version,schema_version,provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(m.sessionId??null,JSON.stringify(m.raw),m.symbol??null,m.price??null,m.sourceMs??null,m.receiveMs,m.ingestMs??m.receiveMs,m.gapBeforeMs??null,m.duplicate?1:0,m.valid?1:0,m.invalidReason??null,m.collectorVersion??null,m.schemaVersion??null,m.provenance??null);}
  observeRoundState(r,seen=Date.now()){const payload=JSON.stringify({s:r.venueStatus,o:r.venueOutcome,u:r.upPoolMicro,d:r.downPoolMicro});this.db.prepare('INSERT OR IGNORE INTO round_state_observations(round_id,observed_ms,venue_status,venue_outcome,up_pool_micro,down_pool_micro,open_micro,close_micro,sha) VALUES(?,?,?,?,?,?,?,?,?)').run(r.id,seen,r.venueStatus??null,r.venueOutcome??null,r.upPoolMicro??null,r.downPoolMicro??null,r.openMicro??null,r.closeMicro??null,sha(payload));}
  raw(source,kind,sourceMs,receivedMs,value){const payload=JSON.stringify(value);this.db.prepare('INSERT INTO raw_events(source,kind,source_ms,received_ms,sha,payload) VALUES (?,?,?,?,?,?)').run(source,kind,sourceMs,receivedMs,sha(payload),payload);}
  saveHistoricalRound(r,provenance='VENUE_RECORDED',retrieved=Date.now()){const raw=JSON.stringify(r.raw??r);this.db.prepare(`INSERT OR IGNORE INTO historical_rounds(id,start_ms,end_ms,open_micro,close_micro,result,retrieved_ms,provenance,raw) VALUES(?,?,?,?,?,?,?,?,?)`).run(r.id,r.startMs,r.endMs,r.openMicro??null,r.closeMicro??null,r.result??null,retrieved,provenance,raw);}
  tick(t){this.db.prepare('INSERT INTO ticks(price,source_ms,received_ms,provenance) VALUES (?,?,?,?)').run(t.price,t.sourceMs,t.receivedMs,t.provenance);this.raw('JUPITER_PRICE_WS','tick',t.sourceMs,t.receivedMs,t.raw);}
  recentTicks(after=Date.now()-125000){return this.db.prepare('SELECT price,source_ms AS sourceMs,received_ms AS receivedMs,provenance FROM ticks WHERE received_ms >=? ORDER BY received_ms').all(after);}
  round(r,seen=Date.now()){const raw=JSON.stringify(r.raw);this.db.prepare(`INSERT INTO rounds(id,start_ms,end_ms,open_micro,close_micro,result,first_seen_ms,last_seen_ms,raw) VALUES(?,?,?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET open_micro=COALESCE(excluded.open_micro,rounds.open_micro),close_micro=COALESCE(excluded.close_micro,rounds.close_micro),result=COALESCE(excluded.result,rounds.result),last_seen_ms=excluded.last_seen_ms,raw=excluded.raw`).run(r.id,r.startMs,r.endMs,r.openMicro,r.closeMicro,r.result,seen,seen,raw);this.raw('JUPITER_ARCADE','round_snapshot',null,seen,r.raw);
    if(r.result && r.endMs <=seen) this.settle(r.id,r.result);
  }
  allRounds(){return this.db.prepare('SELECT id,start_ms AS startMs,end_ms AS endMs,open_micro AS openMicro,close_micro AS closeMicro,result FROM rounds ORDER BY start_ms DESC LIMIT 200').all();}
  saveSnapshot(roundId,asOf,payload){const data=JSON.stringify(payload);const hash=sha(data);this.db.prepare('INSERT OR IGNORE INTO snapshots(round_id,as_of_ms,hash,snapshot,provenance) VALUES(?,?,?,?,?)').run(roundId,asOf,hash,data,'LIVE_RECEIVED_JUPITER_ONLY');return hash;}
  hasRoundDecision(id){return !!this.db.prepare('SELECT 1 AS x FROM decisions WHERE round_id=? LIMIT 1').get(id);}
  saveDecision(d,stake){this.db.prepare(`INSERT OR IGNORE INTO decisions(round_id,arm,status,p_up,action,sent_ms,received_ms,model,error_code,snapshot_sha,answer,usage)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(d.roundId,d.arm,d.status,d.pUp??null,d.action,d.sentMs??null,d.receivedMs??null,d.model??null,d.errorCode??null,d.snapshotHash??null,d.answer?JSON.stringify(d.answer):null,d.usage?JSON.stringify(d.usage):null);
    this.db.prepare('INSERT OR IGNORE INTO paper(round_id,arm,action,stake_usdc) VALUES(?,?,?,?)').run(d.roundId,d.arm,d.action,stake);
  }
  settle(roundId,result){if(!['UP','DOWN','VOID'].includes(result))return;
    this.db.prepare(`UPDATE paper SET result=?,correct=(CASE WHEN action='SKIP' OR ?='VOID' THEN NULL WHEN action=? THEN 1 ELSE 0 END)
    WHERE round_id=? AND result IS NULL`).run(result,result,result,roundId);
  }
  saveEvidence(key,payload){const v=JSON.stringify(payload);this.db.prepare('INSERT OR REPLACE INTO evidence(key,captured_ms,sha,payload) VALUES(?,?,?,?)').run(key,Date.now(),sha(v),v);}
  evidence(key){const x=this.db.prepare('SELECT payload FROM evidence WHERE key=?').get(key);return x?JSON.parse(x.payload):null;}
  stats(){
    const rows=this.db.prepare(`SELECT d.arm AS arm,COUNT(*) AS n,
      SUM(CASE WHEN d.status='OK' THEN 1 ELSE 0 END) AS responded,
      SUM(CASE WHEN d.action!='SKIP' THEN 1 ELSE 0 END) AS trades,
      SUM(CASE WHEN p.correct=1 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN p.correct=0 THEN 1 ELSE 0 END) AS losses,
      AVG(CASE WHEN r.result IN ('UP','DOWN') AND d.p_up IS NOT NULL AND d.status='OK' THEN (d.p_up-CASE WHEN r.result='UP' THEN 1.0 ELSE 0.0 END)*(d.p_up-CASE WHEN r.result='UP' THEN 1.0 ELSE 0.0 END) ELSE NULL END) AS brier,
      AVG(CASE WHEN d.received_ms IS NOT NULL AND d.sent_ms IS NOT NULL THEN d.received_ms-d.sent_ms ELSE NULL END) AS latency_ms
      FROM decisions d LEFT JOIN paper p ON p.round_id=d.round_id AND p.arm=d.arm LEFT JOIN rounds r ON r.id=d.round_id GROUP BY d.arm ORDER BY d.arm`).all();
    const counts=this.db.prepare('SELECT (SELECT COUNT(*) FROM rounds) AS rounds,(SELECT COUNT(*) FROM ticks) AS ticks,(SELECT COUNT(*) FROM snapshots) AS snapshots,(SELECT COUNT(*) FROM pool_observations) AS poolObs').get();
    const recent=this.db.prepare(`SELECT d.round_id,d.arm,d.status,d.p_up,d.action,d.error_code,r.result,p.correct,
      d.sent_ms,d.received_ms FROM decisions d LEFT JOIN rounds r ON d.round_id=r.id LEFT JOIN paper p ON p.round_id=d.round_id AND p.arm=d.arm ORDER BY d.sent_ms DESC LIMIT 60`).all();
    const venueRounds=this.db.prepare(`SELECT id,start_ms AS startMs,end_ms AS endMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM rounds ORDER BY start_ms DESC LIMIT 12`).all().map(r=>{
      let v={}; try{v=JSON.parse(r.raw||'{}');}catch{}
      return {id:r.id,startMs:r.startMs,endMs:r.endMs,result:r.result,status:v.status??null,outcome:v.outcome??null,upPool:v.upPool??null,downPool:v.downPool??null,openPrice:v.openPrice??r.openMicro??null,closePrice:v.closePrice??r.closeMicro??null};
    });
    const tickHealth=this.db.prepare(`SELECT COUNT(*) AS n5m, MAX(received_ms) AS lastMs FROM ticks WHERE received_ms >= ?`).get(Date.now()-300000);
    let clock=null; try{const e=this.db.prepare('SELECT payload FROM evidence WHERE key=?').get('arcade.clock.last'); if(e) clock=JSON.parse(e.payload);}catch{}
    return {demoMode:this.dir.endsWith('/demo-fixture'),counts,arms:rows,recent,venueRounds,tickHealth,clock,profitStatus:'NOT_CALCULATED_UNTIL_VERIFIED_PRELOCK_PAYOUT',generatedAt:new Date().toISOString()};
  }
  close(){this.db.close();}
}
