import { ensureOutcomeSchema } from './outcomes.js';
import { analyzeDecisionErrors, buildSetupLeaderboard, compareGateValue } from './strategy-optimizer.js';

export async function getOptimizationReport(env,{horizon=10,minSample=20,winnerThreshold=.05}={}){
  await ensureOutcomeSchema(env);
  const h=normalizeHorizon(horizon),required=Math.max(5,Number(minSample)||20),threshold=clamp(Number(winnerThreshold),.01,.25,.05);
  const result=await env.DB.prepare(`SELECT e.id,e.symbol,e.status,e.readiness,e.relative_volume AS relativeVolume,e.gates_ready AS gatesReady,e.gate_total AS gateTotal,e.benchmark_risk_off AS benchmarkRiskOff,e.model_version AS modelVersion,e.observed_at AS observedAt,e.payload_json AS payloadJson,o.forward_return AS forwardReturn,o.market_excess_return AS marketExcessReturn,o.sector_excess_return AS sectorExcessReturn FROM evidence_observations e JOIN evidence_outcomes o ON o.observation_id=e.id WHERE e.observation_type='ANALYSIS' AND o.horizon_sessions=? ORDER BY e.observed_at ASC,e.id ASC`).bind(h).all();
  const rows=result.results||[],leaderboard=buildSetupLeaderboard(rows,{minSample:required}),errors=analyzeDecisionErrors(rows,{winnerThreshold:threshold}),gates=compareGateValue(rows);
  return{horizon:h,minSample:required,winnerThreshold:threshold,sampleSize:rows.length,generatedAt:Date.now(),leaderboard,qualifiedSetups:leaderboard.filter(x=>x.qualified),decisionErrors:errors,gateValue:gates,recommendations:recommendations({leaderboard,gates,errors,required}),policy:{liveGateChanges:false,mode:'EVIDENCE_ONLY',message:'Optimization findings are advisory until a challenger model passes forward validation against the current champion.'}};
}

function recommendations({leaderboard,gates,errors,required}){
  const out=[],best=leaderboard.find(x=>x.qualified);if(best)out.push({type:'SETUP_LEADER',confidence:'QUALIFIED',message:`Best qualified setup is ${best.key} with ${(100*(best.winRate||0)).toFixed(1)}% win rate and ${pct(best.expectancy)} expectancy across ${best.sampleSize} observations.`});
  const weakGate=gates.filter(x=>x.fail.sampleSize>=required&&x.winnerBlockRate!=null).sort((a,b)=>finite(b.winnerBlockRate)-finite(a.winnerBlockRate))[0];if(weakGate&&weakGate.winnerBlockRate>=.55)out.push({type:'GATE_REVIEW',confidence:'RESEARCH',message:`${weakGate.gate} blocked winners in ${(weakGate.winnerBlockRate*100).toFixed(1)}% of its failed observations; test it in a challenger before changing production.`});
  const fp=errors.falsePositives?.topCharacteristics?.[0];if(fp)out.push({type:'FALSE_POSITIVE_PATTERN',confidence:'RESEARCH',message:`Most common losing-BUY characteristic: ${fp.key} (${fp.count}/${errors.falsePositives.sampleSize}).`});
  const mw=errors.missedWinners?.topCharacteristics?.[0];if(mw)out.push({type:'MISSED_WINNER_PATTERN',confidence:'RESEARCH',message:`Most common missed-winner characteristic: ${mw.key} (${mw.count}/${errors.missedWinners.sampleSize}).`});
  if(!best)out.push({type:'INSUFFICIENT_SAMPLE',confidence:'WAIT',message:`No setup cohort has reached the ${required}-observation qualification threshold yet.`});return out;
}
function normalizeHorizon(v){const n=Number(v);return[1,3,5,10,20].includes(n)?n:10;}function clamp(v,min,max,fallback){return Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;}function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}function pct(v){return v==null?'n/a':`${(Number(v)*100).toFixed(2)}%`;}
