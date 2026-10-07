import {postJson,TRUSTED} from './http.mjs';
const NAME='next_btc_arcade_up';
export const INSTRUCTION='Given ONLY this Jupiter-derived snapshot received before the decision time, is the UPCOMING BTC Arcade 60-second round more likely to settle UP (future close > its future opening price)? The upcoming opening price is unknown. Do not predict the currently active round. Estimate probability, do not invent missing inputs.';
export const ARMS=['openai','jev','glide'];
export function requestFor(arm,snapshot,cfg) {
  const input=JSON.stringify(snapshot);
  if(arm==='openai')return {url:TRUSTED.openai,key:cfg.openaiKey,model:cfg.openaiModel,body:{model:cfg.openaiModel,input,questions:[{type:'predicate',name:NAME,instructions:INSTRUCTION}]}};
  if(arm==='jev')return {url:TRUSTED.typesafe,key:cfg.typesafeKey,model:cfg.typesafeModel,body:{model:cfg.typesafeModel,state:snapshot,questions:{[NAME]:{type:'noul',instructions:INSTRUCTION}}}};
  if(arm==='glide')return {url:TRUSTED.fastino,key:cfg.fastinoKey,model:cfg.fastinoModel,body:{model:cfg.fastinoModel,state:snapshot,questions:{[NAME]:{type:'noul',instructions:INSTRUCTION}}}};
  throw new Error('UNKNOWN_MODEL_ARM');
}
export function parseAnswer(arm,reply) {
  let p;
  if(arm==='openai') {
    const a=reply?.answers?.find(x=>x.name===NAME);
    if(a?.type!=='predicate')throw new Error('MISSING_OR_REFUSAL');
    p=a.probability;
  } else {
    const a=reply?.answers?.[NAME];
    if(a?.type!=='noul')throw new Error('MISSING_OR_REFUSAL');
    p=a.noul;
  }
  if(typeof p!=='number'||!Number.isFinite(p)||p<0||p>1)throw new Error('BAD_PROBABILITY');
  return {pUp:p,model:typeof reply.model==='string'?reply.model:null,usage:reply.usage||null};
}
export function actionFor(pUp,cfg){return pUp>=cfg.upThreshold?'UP':pUp<=cfg.downThreshold?'DOWN':'SKIP';}
export function deadlineAction(pUp,responseReceivedMs,lockMs,cfg) {if(responseReceivedMs>=lockMs || lockMs-responseReceivedMs<0)return 'SKIP';return actionFor(pUp,cfg);}
// Normalized provider-neutral output contract (P11A). Identity normalization:
// predicate.probability (OpenAI), noul (Jev/GLiDE) all mean P(question true) in [0,1].
// raw_probability_up === normalized_probability_up (no calibration fitted).
const PROVIDER_TAG={openai:'OPENAI_DECISIONS',jev:'JEV',glide:'GLIDE'};
export function normalizeProviderResult(arm, runnerResult) {
  const started = runnerResult.sentMs ?? null;
  const received = runnerResult.receivedMs ?? null;
  const base = {provider: PROVIDER_TAG[arm] ?? String(arm).toUpperCase(),
    model: runnerResult.model ?? null,
    snapshot_id: runnerResult.roundId ?? null,
    input_hash: runnerResult.snapshotHash ?? null,
    raw_probability_up: runnerResult.pUp ?? null,
    normalized_probability_up: runnerResult.pUp ?? null,
    decision: runnerResult.action ?? 'SKIP',
    request_started_ms: started, response_received_ms: received,
    latency_ms: (started != null && received != null) ? received - started : null,
    status: 'UNAVAILABLE', error_code: runnerResult.errorCode ?? null};
  const s = runnerResult.status;
  if (s === 'OK') base.status = 'VALID';
  else if (s === 'LATE' || s === 'MISSED_LOCK') base.status = 'LATE';
  else if (s === 'DISABLED_MISSING_KEY' || s === 'DISABLED_BUDGET') base.status = 'UNAVAILABLE';
  else if (s === 'ERROR') {
    const msg = String(runnerResult.errorCode || '');
    if (/401|402|403|404/.test(msg)) base.status = 'AUTH_ERROR';
    else if (/425|429|503|529|RATE_LIMIT|RETRY|OVERLOAD|WARM/i.test(msg)) base.status = 'RATE_LIMITED';
    else if (/TIMEOUT|TIMED_OUT|ABORT|ABORTED/i.test(msg)) base.status = 'TIMEOUT';
    else if (/BAD_PROBABILITY|MISSING_OR_REFUSAL|MALFORMED|VALIDATION|422/.test(msg)) base.status = 'MALFORMED';
    else base.status = 'UNAVAILABLE';
  }
  return base;
}
export function makeRunner(cfg,call=postJson) {
  const counts=new Map(ARMS.map(x=>[x,0]));let total=0;
  return async function run(arm,roundId,snapshot,snapshotHash,deadlineMs) {
    const common={roundId,arm,snapshotHash,pUp:null,action:'SKIP',status:'SKIP',model:null};
    const r=requestFor(arm,snapshot,cfg);if(!r.key)return {...common,status:'DISABLED_MISSING_KEY',errorCode:'MISSING_KEY'};
    if(total>=cfg.maxCalls ||counts.get(arm)>=cfg.maxArmCalls)return {...common,status:'DISABLED_BUDGET',errorCode:'BUDGET_CAP'};
    const sentMs=Date.now();if(sentMs>=deadlineMs)return {...common,status:'MISSED_LOCK',sentMs,errorCode:'REQUEST_START_LATE'};
    total++;counts.set(arm,counts.get(arm)+1);
    try {
      const reply=await call(r.url,r.key,r.body,Math.min(cfg.requestTimeoutMs,Math.max(100,deadlineMs-sentMs)));
      const receivedMs=Date.now();const parsed=parseAnswer(arm,reply);
      // Preserve late outputs for research, but never mark them as eligible trades.
      const late=receivedMs>=deadlineMs;
      return {...common,status:late?'LATE':'OK',pUp:parsed.pUp,action:late?'SKIP':actionFor(parsed.pUp,cfg),model:parsed.model||r.model,usage:parsed.usage,answer:reply,receivedMs,sentMs,errorCode:late?'RESPONSE_AFTER_LOCK':null};
    } catch(e) {
      return {...common,status:'ERROR',sentMs,receivedMs:Date.now(),model:r.model,errorCode:String(e?.message||'PROVIDER_ERROR').slice(0,96)};
    }
  };
}
