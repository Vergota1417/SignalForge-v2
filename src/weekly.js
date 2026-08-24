import { analyze } from './analysis.js';
import { getMarketData } from './market.js';
import { getWeeklyResearchUniverse } from './discovery.js';
import { evaluateStrategy } from './strategy.js';
import { getPortfolioStrategy, getWeeklyResearchState, latestWeeklyResearchState, listPortfolioPositions, listWeeklyResearch, putWeeklyResearch, putWeeklyResearchState, recordPortfolioStrategy, recordSignal } from './db.js';
import { recordAnalysisEvidence } from './evidence.js';
import { loadBenchmarkEvidence } from './benchmark-loader.js';

export async function runWeeklyResearchBatch(env,{batchSize=6,now=new Date()}={}) {
  const weekKey=investmentWeekKey(now);
  const universe=(await getWeeklyResearchUniverse(env,{limit:36,now:now.getTime(),weekKey})).filter(symbol=>symbol!=='SPY');
  const state=await getWeeklyResearchState(env,weekKey);
  if(state.completedAt>0||state.cursor>=universe.length){if(!state.completedAt)await putWeeklyResearchState(env,{weekKey,cursor:universe.length,universeSize:universe.length,completed:true});return{weekKey,completed:true,cursor:universe.length,universeSize:universe.length,scanned:[]};}
  let benchmarkCandles=null;try{benchmarkCandles=(await getMarketData(env,'SPY','1Y',false,{completedOnly:true})).candles;}catch(error){console.error(JSON.stringify({event:'weekly_benchmark_error',message:error?.message||String(error)}));}
  if(!benchmarkCandles)throw new Error('Weekly research requires the SPY benchmark.');
  const start=Math.min(state.cursor,universe.length),symbols=universe.slice(start,start+Math.max(1,Math.min(6,batchSize))),scanned=[];
  for(const symbol of symbols){try{
    const market=await getMarketData(env,symbol,'1Y',false,{completedOnly:true}),analysis=analyze(market.candles,symbol,{benchmarkCandles}),strategy=evaluateStrategy(analysis,null);
    const benchmarkEvidence=await loadBenchmarkEvidence(env,symbol,{stockCandles:market.candles,timeframe:'1Y',completedOnly:true,purposePrefix:'weekly-benchmark-context',preloaded:{SPY:benchmarkCandles}});
    await putWeeklyResearch(env,{weekKey,symbol,analysis,strategy});await recordSignal(env,analysis);await recordAnalysisEvidence(env,analysis,{source:'weekly-research',timeframe:'1Y',now:now.getTime(),benchmarkContext:benchmarkEvidence.context});
    scanned.push({symbol,state:strategy?.state||'WATCH',score:Number(strategy?.opportunityScore)||0,dataQuality:market.quality||null,benchmarkContext:benchmarkEvidence.context,benchmarkErrors:benchmarkEvidence.errors});
  }catch(error){console.error(JSON.stringify({event:'weekly_symbol_error',symbol,message:error?.message||String(error)}));break;}}
  const cursor=Math.min(universe.length,start+scanned.length),completed=cursor>=universe.length;await putWeeklyResearchState(env,{weekKey,cursor,universeSize:universe.length,completed});return{weekKey,completed,cursor,universeSize:universe.length,scanned};
}

export async function getWeeklyStrategySnapshot(env){
  const latest=await latestWeeklyResearchState(env);if(!latest){const universe=await getWeeklyResearchUniverse(env,{limit:36});return{weekKey:null,complete:false,progress:0,scanned:0,universeSize:universe.length,ranked:[]};}
  const rows=await listWeeklyResearch(env,latest.weekKey),ranked=rows.map(row=>{const strategy=evaluateStrategy(row.analysis,null);return{...row,score:Number(strategy?.opportunityScore)||0,strategy};}).filter(row=>row.strategy).sort((a,b)=>strategyPriority(b)-strategyPriority(a)||b.score-a.score);
  return{weekKey:latest.weekKey,complete:Boolean(latest.completedAt),completedAt:latest.completedAt||null,updatedAt:latest.updatedAt||null,scanned:rows.length,universeSize:latest.universeSize,progress:latest.universeSize?Math.min(100,Math.round(rows.length/latest.universeSize*100)):0,ranked};
}

export async function runPortfolioCloseReview(env,{maxPositions=6}={}){
  const positions=await listPortfolioPositions(env);if(!positions.length)return{reviewed:[],skipped:0};
  let benchmarkCandles=null;try{benchmarkCandles=(await getMarketData(env,'SPY','6M',false)).candles;}catch(error){console.error(JSON.stringify({event:'portfolio_benchmark_error',message:error?.message||String(error)}));}
  if(!benchmarkCandles)throw new Error('Portfolio review requires the SPY benchmark.');
  const reviewed=[];
  for(const holding of positions.slice(0,Math.max(1,Math.min(6,maxPositions)))){
    try{
      const [market,previous]=await Promise.all([getMarketData(env,holding.symbol,'6M',false),getPortfolioStrategy(env,holding.symbol)]),analysis=analyze(market.candles,holding.symbol,{benchmarkCandles}),strategy=evaluateStrategy(analysis,holding,null,previous?.strategy||null),event=await recordPortfolioStrategy(env,holding.symbol,strategy);
      const benchmarkEvidence=await loadBenchmarkEvidence(env,holding.symbol,{stockCandles:market.candles,timeframe:'6M',purposePrefix:'portfolio-benchmark-context',preloaded:{SPY:benchmarkCandles}});
      await recordAnalysisEvidence(env,analysis,{source:'portfolio-close-review',timeframe:'6M',benchmarkContext:benchmarkEvidence.context});
      reviewed.push({symbol:holding.symbol,strategy,event,analysis,benchmarkContext:benchmarkEvidence.context,benchmarkErrors:benchmarkEvidence.errors});
    }catch(error){console.error(JSON.stringify({event:'portfolio_review_error',symbol:holding.symbol,message:error?.message||String(error)}));}
  }
  return{reviewed,skipped:Math.max(0,positions.length-reviewed.length)};
}

export function investmentWeekKey(date=new Date()){const p=easternDateParts(date),base=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))),weekday=(base.getUTCDay()+6)%7;base.setUTCDate(base.getUTCDate()-weekday);return base.toISOString().slice(0,10);}
function strategyPriority(row){const order={'BUY WINDOW':4,'BUY CANDIDATE':3,'WATCH':2,'AVOID':0};return order[row?.strategy?.state]||0;}
function easternDateParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
