import { ensureOutcomeSchema, runOutcomeTracker } from './outcomes.js';
import { opportunityScoreFor } from './screener.js';
import { recordOperation } from './operations.js';

export const OPPORTUNITY_VALIDATION_HORIZONS=Object.freeze([1,3,5]);
export const OPPORTUNITY_EPISODE_START_SCORE=60;
export const OPPORTUNITY_EPISODE_RESET_SCORE=50;
export const OPPORTUNITY_EPISODE_GAP_MS=36*60*60*1000;
export const OPPORTUNITY_REVIEW_MIN_SAMPLE=30;
export const OPPORTUNITY_VALIDATION_LOOKBACK_DAYS=120;
const MAX_VALIDATION_ROWS=6000;

export async function getOpportunityValidation(env,{horizon=5,now=Date.now(),minSample=OPPORTUNITY_REVIEW_MIN_SAMPLE}={}){
  await ensureOutcomeSchema(env);
  const normalizedHorizon=normalizeHorizon(horizon),since=Number(now)-OPPORTUNITY_VALIDATION_LOOKBACK_DAYS*86_400_000,querySince=since-OPPORTUNITY_EPISODE_GAP_MS,requiredSample=normalizeMinSample(minSample);
  const rows=await env.DB.prepare(`SELECT e.id,e.symbol,e.observed_at AS observedAt,e.price,e.change_pct AS changePct,e.discovery_score AS discoveryScore,e.score_velocity AS scoreVelocity,e.relative_volume AS relativeVolume,e.dollar_volume AS dollarVolume,o.horizon_sessions AS horizonSessions,o.forward_return AS forwardReturn,o.mfe,o.mae,o.market_excess_return AS marketExcessReturn FROM (SELECT id,symbol,observed_at,price,change_pct,discovery_score,score_velocity,relative_volume,dollar_volume FROM evidence_observations WHERE observation_type='RADAR' AND observed_at>=? ORDER BY observed_at DESC,id DESC LIMIT ?) e LEFT JOIN evidence_outcomes o ON o.observation_id=e.id AND o.horizon_sessions IN (1,3,5) ORDER BY e.symbol ASC,e.observed_at ASC,e.id ASC,o.horizon_sessions ASC`).bind(querySince,MAX_VALIDATION_ROWS).all();
  const observations=normalizeRows(rows.results||[]),episodes=buildOpportunityEpisodes(observations).filter(row=>Number(row.observedAt)>=since),summary=summarizeOpportunityValidation(episodes,{horizon:normalizedHorizon,minSample:requiredSample});
  return{...summary,lookbackDays:OPPORTUNITY_VALIDATION_LOOKBACK_DAYS,rowsConsidered:observations.length,episodeRules:{startScore:OPPORTUNITY_EPISODE_START_SCORE,resetScore:OPPORTUNITY_EPISODE_RESET_SCORE,gapHours:OPPORTUNITY_EPISODE_GAP_MS/3_600_000,counting:'FIRST_THRESHOLD_CROSSING_PER_EPISODE'},methodology:'Opportunity Score is evaluated on forward market outcomes only. Repeated 15-minute observations inside one persistent opportunity do not count as independent samples. Lookback includes a pre-window buffer so already-active opportunities are not miscounted as new episodes.',shadowOnly:true,affectsBuyNow:false};
}

export async function runOpportunityValidationCycle(env,{now=Date.now(),maxSymbols=3}={}){
  const tracker=await runOutcomeTracker(env,{now,maxSymbols:Math.max(1,Math.min(6,Number(maxSymbols)||3)),observationType:'RADAR',requiredHorizon:5});
  const validation=await getOpportunityValidation(env,{now,horizon:5});
  await recordOperation(env,'opportunity-score-validation',{status:validation.status==='REVIEW CANDIDATE'?'OK':validation.completedEpisodes?'OK':'IDLE',at:now,detail:{status:validation.status,completedEpisodes:validation.completedEpisodes,pendingEpisodes:validation.pendingEpisodes,highScoreSample:validation.highScore?.sampleSize||0,highScoreMarketSample:validation.highScore?.marketSampleSize||0,highScoreWinRate:validation.highScore?.winRate??null,highScoreAvgReturn:validation.highScore?.avgReturn??null,highScoreMarketExcess:validation.highScore?.avgMarketExcess??null,scoreGradientConfirmed:validation.scoreGradientConfirmed,affectsBuyNow:false,tracker:{observationType:tracker.observationType,requiredHorizon:tracker.requiredHorizon,symbolsProcessed:tracker.symbolsProcessed,outcomesCompleted:tracker.outcomesCompleted,deferred:tracker.deferred,errors:(tracker.errors||[]).slice(0,4)}}});
  return{tracker,validation};
}

export function isOpportunityValidationSlot(scheduledTime){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(Number(scheduledTime)||Date.now())),p=Object.fromEntries(parts.map(x=>[x.type,x.value])),minutes=Number(p.hour)*60+Number(p.minute);
  return !['Sat','Sun'].includes(p.weekday)&&minutes>=16*60+15&&minutes<=18*60+45&&minutes%30===15;
}

export function buildOpportunityEpisodes(observations,{startScore=OPPORTUNITY_EPISODE_START_SCORE,resetScore=OPPORTUNITY_EPISODE_RESET_SCORE,gapMs=OPPORTUNITY_EPISODE_GAP_MS}={}){
  const grouped=new Map();
  for(const row of observations||[]){const symbol=String(row?.symbol||'').toUpperCase();if(!symbol)continue;if(!grouped.has(symbol))grouped.set(symbol,[]);grouped.get(symbol).push(row);}
  const episodes=[];
  for(const [symbol,rows] of grouped){
    rows.sort((a,b)=>Number(a.observedAt)-Number(b.observedAt)||Number(a.id)-Number(b.id));
    let active=false,lastAt=0;
    for(const row of rows){
      const at=Number(row.observedAt)||0,score=opportunityScoreFor({discoveryScore:row.discoveryScore,scoreVelocity:row.scoreVelocity,relativeVolume:row.relativeVolume,dollarVolume:row.dollarVolume,changePct:row.changePct});
      if(lastAt&&at-lastAt>gapMs)active=false;
      if(score<resetScore)active=false;
      if(!active&&score>=startScore){episodes.push({...row,symbol,opportunityScore:score,scoreBand:scoreBand(score)});active=true;}
      lastAt=at;
    }
  }
  return episodes.sort((a,b)=>Number(a.observedAt)-Number(b.observedAt)||String(a.symbol).localeCompare(String(b.symbol)));
}

export function summarizeOpportunityValidation(episodes,{horizon=5,minSample=OPPORTUNITY_REVIEW_MIN_SAMPLE}={}){
  const normalizedHorizon=normalizeHorizon(horizon),requiredSample=normalizeMinSample(minSample),completed=(episodes||[]).filter(row=>outcomeFor(row,normalizedHorizon)),pending=(episodes||[]).filter(row=>!outcomeFor(row,normalizedHorizon));
  const tiers=[
    summarizeTier(completed.filter(x=>x.opportunityScore>=90),normalizedHorizon,'90–100'),
    summarizeTier(completed.filter(x=>x.opportunityScore>=80&&x.opportunityScore<90),normalizedHorizon,'80–89'),
    summarizeTier(completed.filter(x=>x.opportunityScore>=70&&x.opportunityScore<80),normalizedHorizon,'70–79'),
    summarizeTier(completed.filter(x=>x.opportunityScore>=60&&x.opportunityScore<70),normalizedHorizon,'60–69')
  ];
  const highScore=summarizeTier(completed.filter(x=>x.opportunityScore>=80),normalizedHorizon,'80–100'),comparison=summarizeTier(completed.filter(x=>x.opportunityScore>=60&&x.opportunityScore<80),normalizedHorizon,'60–79');
  const scoreGradientConfirmed=highScore.sampleSize>=Math.min(10,requiredSample)&&comparison.sampleSize>=10&&highScore.avgReturn>comparison.avgReturn&&highScore.winRate>=comparison.winRate;
  const criteria={sampleSize:highScore.sampleSize>=requiredSample,marketCoverage:highScore.marketSampleSize>=requiredSample,winRate:highScore.winRate>=.55,positiveExpectancy:highScore.avgReturn>0,positiveMarketExcess:highScore.avgMarketExcess>0,marketBeatRate:highScore.marketBeatRate>=.52,scoreGradient:scoreGradientConfirmed};
  const enough=highScore.sampleSize>=requiredSample,status=!enough?'COLLECTING':Object.values(criteria).every(Boolean)?'REVIEW CANDIDATE':'NOT VALIDATED';
  return{status,horizonSessions:normalizedHorizon,minSample:requiredSample,totalEpisodes:(episodes||[]).length,completedEpisodes:completed.length,pendingEpisodes:pending.length,highScore,comparison,tiers,criteria,scoreGradientConfirmed,falsePositiveRate:highScore.sampleSize?1-highScore.winRate:null,marketUnderperformRate:highScore.marketSampleSize?1-highScore.marketBeatRate:null,reviewRule:`A REVIEW CANDIDATE requires ${requiredSample}+ completed 5-session high-score episodes with matching market benchmarks, >=55% positive outcomes, positive average return, positive market excess, >=52% market-beat rate, and a better 80+ score cohort than the 60–79 cohort. Review status still cannot affect BUY NOW.`,shadowOnly:true,affectsBuyNow:false};
}

function normalizeRows(rows){
  const byId=new Map();
  for(const raw of rows||[]){const id=Number(raw.id);if(!id)continue;let row=byId.get(id);if(!row){row={id,symbol:String(raw.symbol||'').toUpperCase(),observedAt:Number(raw.observedAt)||0,price:num(raw.price),changePct:num(raw.changePct),discoveryScore:num(raw.discoveryScore),scoreVelocity:num(raw.scoreVelocity),relativeVolume:num(raw.relativeVolume),dollarVolume:num(raw.dollarVolume),outcomes:{}};byId.set(id,row);}const horizon=Number(raw.horizonSessions);if(OPPORTUNITY_VALIDATION_HORIZONS.includes(horizon))row.outcomes[horizon]={horizonSessions:horizon,forwardReturn:num(raw.forwardReturn),mfe:num(raw.mfe),mae:num(raw.mae),marketExcessReturn:nullableNum(raw.marketExcessReturn)};}
  return[...byId.values()];
}
function summarizeTier(rows,horizon,label){const outcomes=(rows||[]).map(row=>outcomeFor(row,horizon)).filter(Boolean),sampleSize=outcomes.length;if(!sampleSize)return{label,sampleSize:0,marketSampleSize:0,avgReturn:null,winRate:null,avgMarketExcess:null,marketBeatRate:null,avgMfe:null,avgMae:null};const returns=outcomes.map(x=>x.forwardReturn),market=outcomes.map(x=>x.marketExcessReturn).filter(x=>x!==null);return{label,sampleSize,marketSampleSize:market.length,avgReturn:mean(returns),winRate:returns.filter(x=>x>0).length/sampleSize,avgMarketExcess:market.length?mean(market):null,marketBeatRate:market.length?market.filter(x=>x>0).length/market.length:null,avgMfe:mean(outcomes.map(x=>x.mfe)),avgMae:mean(outcomes.map(x=>x.mae))};}
function outcomeFor(row,horizon){const value=row?.outcomes?.[horizon];return value&&Number.isFinite(Number(value.forwardReturn))?value:null;}
function scoreBand(score){if(score>=90)return'90–100';if(score>=80)return'80–89';if(score>=70)return'70–79';return'60–69';}
function normalizeHorizon(value){const n=Number(value);return OPPORTUNITY_VALIDATION_HORIZONS.includes(n)?n:5;}
function normalizeMinSample(value){const n=Math.round(Number(value)||OPPORTUNITY_REVIEW_MIN_SAMPLE);return Math.max(OPPORTUNITY_REVIEW_MIN_SAMPLE,Math.min(100,n));}
function mean(values){const clean=(values||[]).map(Number).filter(Number.isFinite);return clean.length?clean.reduce((a,b)=>a+b,0)/clean.length:null;}
function num(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function nullableNum(value){if(value===null||value===undefined)return null;const n=Number(value);return Number.isFinite(n)?n:null;}
