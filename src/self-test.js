import { analyze } from './analysis.js';
import { getMarketData } from './market.js';
import { getOutcomeStatus } from './outcomes.js';
import { getEvidenceStatus } from './evidence.js';
import { getOperationsStatus, recordOperation } from './operations.js';
import { pushConfigured } from './push.js';

export async function runBackendSelfTest(env,{symbol='XOM',now=Date.now()}={}){
  const checks=[];
  const check=async(name,fn)=>{const started=Date.now();try{const detail=await fn();checks.push({name,status:'PASS',ms:Date.now()-started,detail:detail||null});}catch(error){checks.push({name,status:'FAIL',ms:Date.now()-started,error:String(error?.message||error)});}};
  await check('database',async()=>{const probeKey='backend-self-test-db-probe';await recordOperation(env,probeKey,{status:'OK',at:now,detail:{probe:true}});const row=await env.DB.prepare(`SELECT last_run_at AS checkedAt FROM operation_status WHERE operation_key=?`).bind(probeKey).first();if(Number(row?.checkedAt)!==Number(now))throw new Error('Database self-test write/read mismatch.');return{writeRead:true};});
  let market=null;
  await check('market-provider',async()=>{market=await getMarketData(env,symbol,'3M',false,{completedOnly:true,purpose:'backend-self-test'});if(!market?.candles?.length)throw new Error('No completed market candles returned.');return{symbol,candles:market.candles.length,source:market.source||null,cached:Boolean(market.cached)};});
  await check('analysis-engine',async()=>{if(!market?.candles?.length)throw new Error('Market provider check did not produce candles.');const analysis=analyze(market.candles,symbol);if(!analysis||!analysis.status)throw new Error('Analysis engine returned no status.');return{symbol,status:analysis.status,readiness:Number(analysis.readiness)||0};});
  await check('evidence-subsystem',async()=>{const status=await getEvidenceStatus(env);return{reachable:true,totalObservations:Number(status.totalObservations)||0,distinctSymbols:Number(status.distinctSymbols)||0};});
  await check('outcome-subsystem',async()=>{const status=await getOutcomeStatus(env);return{reachable:true,outcomeRows:Number(status.outcomeRows)||0,completed20:Number(status.observationsWith20SessionOutcome)||0};});
  await check('operations-subsystem',async()=>{const status=await getOperationsStatus(env);return{reachable:true,schedulerHealthy:Boolean(status.scheduler?.healthy),lastHeartbeat:Number(status.scheduler?.lastHeartbeat)||0};});
  checks.push({name:'push-configuration',status:pushConfigured(env)?'PASS':'WARN',ms:0,detail:{configured:pushConfigured(env)}});
  const failed=checks.filter(x=>x.status==='FAIL').length,warnings=checks.filter(x=>x.status==='WARN').length,passed=checks.filter(x=>x.status==='PASS').length,result={ranAt:now,symbol,passed,failed,warnings,total:checks.length,status:failed?'FAIL':warnings?'WARN':'PASS',checks,contaminatesEvidence:false};
  await recordOperation(env,'backend-self-test',{status:failed?'ERROR':'OK',at:now,detail:{passed,failed,warnings,symbol,checks:checks.map(x=>({name:x.name,status:x.status,error:x.error||null}))}});
  return result;
}
