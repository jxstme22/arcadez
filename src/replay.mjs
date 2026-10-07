import {featuresAsOf} from './market.mjs';
export function checkSnapshotReplay(store,maxPriceAgeMs=2500){
  const rows=store.db.prepare('SELECT round_id,as_of_ms,snapshot FROM snapshots ORDER BY as_of_ms').all();
  const failures=[];let checked=0;let fixture=0;
  const query=store.db.prepare('SELECT price,source_ms AS sourceMs,received_ms AS receivedMs,provenance FROM ticks WHERE received_ms <=? AND received_ms >=? ORDER BY received_ms');
  for(const row of rows){
    const snap=JSON.parse(row.snapshot);
    if(snap.experiment==='FIXTURE_ONLY_NOT_LIVE'){fixture++;continue;}
    const input=query.all(row.as_of_ms,row.as_of_ms-121000);
    const fresh=featuresAsOf(input,row.as_of_ms,maxPriceAgeMs);
    checked++;
    if(JSON.stringify(fresh)!==JSON.stringify(snap.feature))failures.push({roundId:row.round_id,expected:snap.feature,observed:fresh});
  }
  return {replayedLiveSnapshots:checked,skippedFixtureSnapshots:fixture,failures,pass:failures.length===0};
}
