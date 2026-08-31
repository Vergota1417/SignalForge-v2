import { ensureSchema, listPortfolioPositions } from './db.js';
import { recordOperation } from './operations.js';
import { configuredProviders } from './market.js';
import { runRadarDiscovery } from './radar.js';
import { getSmartScreenerSnapshot, runPriorityExecutionPulse, runScreenerPromotion } from './screener.js';
import { getAfterHoursResearchStatus, runAfterHoursResearch } from './research.js';
import { getWeeklyStrategySnapshot, runPortfolioCloseReview, runPortfolioPricePulse, runWeeklyResearchBatch } from './weekly.js';
import { rankOpportunities } from './strategy.js';
import { broadcastBackgroundSummaryPush, broadcastPortfolioStrategyPush, broadcastWeeklyOpportunityPush } from './push.js';
import { runOpportunityValidationCycle } from './opportunity-validation.js';
import { runOutcomeTracker } from './outcomes.js';
import {
  RADAR_BATCH_SIZE,
  WEEKLY_RESEARCH_SCHEDULE,
  broadDiscoveryCoverage,
  discoveryProviderEnvelope,
  isAfterHoursResearchSlot,
  isBroadDiscoverySlot,
  isOpeningScanSlot,
  isPortfolioCloseReviewSlot,
  isPriorityExecutionSlot,
  isWeekendResearchSlot,
  isWeekendSummarySlot,
  isWeeklyResearchSlot,
  openingScanLabel,
  schedulerCoverage
} from './scanner-schedule.js';

export async function runScheduledCycle(env,scheduledTime=Date.now()){
  const at=Number(scheduledTime)||Date.now(),date=new Date(at),p=easternParts(date),minutes=Number(p.hour)*60+Number(p.minute),weekday=p.weekday;
  try{
    await ensureSchema(env);
    const marketDataProviders=configuredProviders(env),marketDataConfigured=Boolean(marketDataProviders.alpaca||marketDataProviders.twelveData);
    await recordOperation(env,'cron-heartbeat',{status:marketDataConfigured?'OK':'IDLE',at,detail:{weekday,minutes,marketDataConfigured,marketDataProviders,scheduleOwner:'scheduler-v1'}});
    if(!marketDataConfigured)return;

    if(isOpeningScanSlot(weekday,minutes)){
      await runMarketScanCycle(env,{now:at,weekday,minutes,phase:openingScanLabel(minutes)});
      return;
    }
    if(isBroadDiscoverySlot(weekday,minutes)){
      await runMarketScanCycle(env,{now:at,weekday,minutes,phase:'REGULAR DISCOVERY'});
      return;
    }
    if(isPriorityExecutionSlot(weekday,minutes)){
      await Promise.all([
        runPriorityCycle(env,{now:at,weekday,minutes}),
        runPortfolioPulseCycle(env,{now:at,weekday,minutes})
      ]);
      return;
    }
    if(isPortfolioCloseReviewSlot(weekday,minutes)){
      await runPortfolioCloseCycle(env,{now:at});
      return;
    }
    if(isAfterHoursResearchSlot(weekday,minutes)){
      await runAfterHoursCycle(env,{now:at,weekday,minutes});
      return;
    }
    if(isWeeklyResearchSlot(weekday,minutes)){
      await runWeeklyResearchCycle(env,{now:date});
      return;
    }
    if(isWeekendResearchSlot(weekday,minutes)){
      const weekendResearch=await runAfterHoursResearch(env,{now:at,maxPerRun:6,expandUniverse:true});
      console.log(JSON.stringify({event:'weekend_research_cycle',weekday,...weekendResearch}));
      await runBackgroundSummary(env,{weekday,now:at,weekend:true});
      return;
    }
    if(isWeekendSummarySlot(weekday,minutes)){
      await runBackgroundSummary(env,{weekday,now:at,weekend:true});
    }
  }catch(error){
    await recordOperation(env,'cron-heartbeat',{status:'ERROR',at,detail:{weekday,minutes,message:error?.message||String(error),scheduleOwner:'scheduler-v1'}}).catch(()=>{});
    console.error(JSON.stringify({event:'scheduled_cycle_error',weekday,minutes,message:error?.message||String(error)}));
  }
}

export function scheduledCoverage(){return{...schedulerCoverage(),providerEnvelope:discoveryProviderEnvelope(),broadDiscovery:broadDiscoveryCoverage(),opportunityValidation:{afterHours:true,shadowOnly:true,affectsBuyNow:false},analysisOutcomeTracking:{afterHours:true,horizons:[1,3,5,10,20],affectsBuyNow:false},owner:'scheduler-v1'};}

async function runMarketScanCycle(env,{now,weekday,minutes,phase}){
  const operationKey=isOpeningScanSlot(weekday,minutes)?'opening-pipeline':'radar-scan-cycle';
  try{
    const radar=await runRadarDiscovery(env,{batchSize:RADAR_BATCH_SIZE,now}),promotion=await runScreenerPromotion(env,{maxPromotions:1,now});
    const detail={phase,weekday,minutes,requested:radar.selected||null,scanned:(radar.scanned||[]).map(x=>x.symbol),leaders:(radar.leaders||[]).map(x=>x.symbol),promoted:(promotion.promoted||[]).map(x=>({symbol:x.symbol,status:x.status,readiness:x.readiness})),candidates:promotion.candidates||[],universeSize:Number(radar.universeSize)||0};
    await recordOperation(env,operationKey,{status:detail.scanned.length?'OK':'IDLE',at:now,detail});
    console.log(JSON.stringify({event:'scheduled_market_scan_cycle',...detail}));
  }catch(error){
    await recordOperation(env,operationKey,{status:'ERROR',at:now,detail:{phase,weekday,minutes,message:error?.message||String(error)}}).catch(()=>{});
    throw error;
  }
}

async function runPriorityCycle(env,{now,weekday,minutes}){
  const pulse=await runPriorityExecutionPulse(env,{maxCandidates:2,now});
  await recordOperation(env,'priority-execution',{status:'OK',at:now,detail:{weekday,minutes,candidates:pulse.candidates||[],pulsed:(pulse.pulsed||[]).map(row=>({symbol:row.symbol,status:row.status,gatesReady:row.gatesReady,rr:row.rr})),skipped:pulse.skipped||null}});
  console.log(JSON.stringify({event:'priority_execution_cycle',...pulse}));
}

async function runPortfolioPulseCycle(env,{now,weekday,minutes}){
  const pulse=await runPortfolioPricePulse(env,{maxPositions:1,now});
  for(const row of pulse.reviewed||[]){
    if(!row?.event?.changed||!row.strategy)continue;
    try{
      const push=await broadcastPortfolioStrategyPush(env,{symbol:row.symbol,strategy:row.strategy,previousState:row.event.previousState,occurredAt:row.event.now});
      console.log(JSON.stringify({event:'portfolio_price_pulse_push',symbol:row.symbol,state:row.strategy.state,...push}));
    }catch(error){console.error(JSON.stringify({event:'portfolio_price_pulse_push_error',symbol:row.symbol,message:error?.message||String(error)}));}
  }
  await recordOperation(env,'portfolio-price-pulse',{status:(pulse.reviewed||[]).length?'OK':'IDLE',at:now,detail:{weekday,minutes,candidates:pulse.candidates||[],reviewed:(pulse.reviewed||[]).map(row=>({symbol:row.symbol,state:row.strategy?.state||null,price:row.price||null,changed:Boolean(row.event?.changed),skipped:row.skipped||null,error:row.error||null}))}});
  console.log(JSON.stringify({event:'portfolio_price_pulse_cycle',...pulse}));
}

async function runPortfolioCloseCycle(env,{now}){
  const result=await runPortfolioCloseReview(env,{maxPositions:6});
  for(const row of result.reviewed||[]){
    if(!row.event?.changed)continue;
    try{
      const push=await broadcastPortfolioStrategyPush(env,{symbol:row.symbol,strategy:row.strategy,previousState:row.event.previousState,occurredAt:row.event.now});
      console.log(JSON.stringify({event:'portfolio_strategy_push',symbol:row.symbol,state:row.strategy.state,...push}));
    }catch(error){console.error(JSON.stringify({event:'portfolio_strategy_push_error',symbol:row.symbol,message:error?.message||String(error)}));}
  }
  console.log(JSON.stringify({event:'portfolio_close_review',reviewed:(result.reviewed||[]).map(x=>({symbol:x.symbol,state:x.strategy.state})),skipped:result.skipped}));
}

async function runAfterHoursCycle(env,{now,weekday,minutes}){
  const result=await runAfterHoursResearch(env,{now,maxPerRun:6});
  console.log(JSON.stringify({event:'after_hours_research_cycle',...result}));
  try{
    const validation=await runOpportunityValidationCycle(env,{now,maxSymbols:3});
    console.log(JSON.stringify({event:'opportunity_score_validation_cycle',status:validation.validation.status,completedEpisodes:validation.validation.completedEpisodes,pendingEpisodes:validation.validation.pendingEpisodes,trackerOutcomes:validation.tracker.outcomesCompleted,affectsBuyNow:false}));
  }catch(error){console.error(JSON.stringify({event:'opportunity_score_validation_cycle_error',message:error?.message||String(error),affectsBuyNow:false}));}
  try{
    const tracker=await runOutcomeTracker(env,{now,maxSymbols:2,observationType:'ANALYSIS',requiredHorizon:20});
    await recordOperation(env,'analysis-outcome-tracker',{status:tracker.errors?.length&&!tracker.outcomesCompleted?'ERROR':tracker.observationsConsidered?'OK':'IDLE',at:now,detail:{observationType:'ANALYSIS',requiredHorizon:20,symbolsProcessed:tracker.symbolsProcessed,observationsConsidered:tracker.observationsConsidered,outcomesCompleted:tracker.outcomesCompleted,deferred:tracker.deferred,errors:(tracker.errors||[]).slice(0,4)}});
    console.log(JSON.stringify({event:'analysis_outcome_tracker_cycle',observationType:'ANALYSIS',requiredHorizon:20,symbolsProcessed:tracker.symbolsProcessed,observationsConsidered:tracker.observationsConsidered,outcomesCompleted:tracker.outcomesCompleted,deferred:tracker.deferred,errors:(tracker.errors||[]).length,affectsBuyNow:false}));
  }catch(error){await recordOperation(env,'analysis-outcome-tracker',{status:'ERROR',at:now,detail:{message:error?.message||String(error),observationType:'ANALYSIS'}}).catch(()=>{});console.error(JSON.stringify({event:'analysis_outcome_tracker_cycle_error',message:error?.message||String(error),affectsBuyNow:false}));}
  if(minutes===18*60+45)await runBackgroundSummary(env,{weekday,now,weekend:false});
}

async function runWeeklyResearchCycle(env,{now}){
  const result=await runWeeklyResearchBatch(env,{batchSize:6,now});
  console.log(JSON.stringify({event:'weekly_research_batch',weekKey:result.weekKey,scanned:result.scanned,cursor:result.cursor,universeSize:result.universeSize,completed:result.completed,schedule:'SATURDAY'}));
  if(result.completed&&result.scanned.length){
    const[snapshot,positions]=await Promise.all([getWeeklyStrategySnapshot(env),listPortfolioPositions(env)]),top=rankOpportunities(snapshot.ranked,positions)[0];
    if(top){
      try{
        const push=await broadcastWeeklyOpportunityPush(env,{weekKey:snapshot.weekKey,row:top,occurredAt:now.getTime()});
        console.log(JSON.stringify({event:'weekly_opportunity_push',symbol:top.symbol,state:top.strategy?.state,...push}));
      }catch(error){console.error(JSON.stringify({event:'weekly_opportunity_push_error',message:error?.message||String(error)}));}
    }
  }
}

async function runBackgroundSummary(env,{weekday,now,weekend}){
  const[screener,research]=await Promise.all([getSmartScreenerSnapshot(env,{limit:10}),getAfterHoursResearchStatus(env)]),top=bestSummaryCandidate(screener?.rows||[]);
  const push=await broadcastBackgroundSummaryPush(env,{dayLabel:weekday,top,research,weekend:Boolean(weekend),occurredAt:now});
  console.log(JSON.stringify({event:weekend?'weekend_background_summary':'daily_background_summary',weekday,symbol:top?.symbol||null,...push}));
}

function bestSummaryCandidate(rows){return(rows||[]).find(row=>row?.bucket&&row.bucket!=='AVOID')||(rows||[])[0]||null;}
function easternParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
