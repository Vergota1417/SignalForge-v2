import { listRadarQuotes, listSignals } from './db.js';
import { recordOperation } from './operations.js';
import { broadcastPaperActionPush } from './push.js';

export const PAPER_ACTION_STARTING_CASH=300;
export const PAPER_ACTION_MAX_OPEN=3;
export const PAPER_ACTION_RISK_PER_TRADE=.01;
export const PAPER_ACTION_MAX_POSITION_PCT=.25;
export const PAPER_ACTION_MIN_READINESS=70;
export const PAPER_ACTION_MIN_RR=1.5;
const SLIPPAGE_PCT=.0005;
const MAX_MARK_AGE_MS=20*60*1000;
const schemaReady=new WeakMap();

export async function ensurePaperActionSchema(env){
  if(!env?.DB)throw new Error('D1 binding DB is not configured.');
  let ready=schemaReady.get(env.DB);
  if(!ready){ready=initialize(env).catch(error=>{schemaReady.delete(env.DB);throw error;});schemaReady.set(env.DB,ready);}return ready;
}

async function initialize(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_action_state (id INTEGER PRIMARY KEY CHECK(id=1),starting_cash REAL NOT NULL,cash REAL NOT NULL,started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_action_positions (symbol TEXT PRIMARY KEY,entry_price REAL NOT NULL,shares REAL NOT NULL,stop_price REAL NOT NULL,target_price REAL NOT NULL,opened_at INTEGER NOT NULL,source_status TEXT NOT NULL,source_readiness REAL NOT NULL,source_gates_ready INTEGER NOT NULL,source_rr REAL NOT NULL,source_signal_updated_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_action_trades (id INTEGER PRIMARY KEY AUTOINCREMENT,symbol TEXT NOT NULL,entry_price REAL NOT NULL,exit_price REAL NOT NULL,shares REAL NOT NULL,pnl REAL NOT NULL,pnl_pct REAL NOT NULL,source_status TEXT NOT NULL,source_readiness REAL NOT NULL,source_gates_ready INTEGER NOT NULL,source_rr REAL NOT NULL,opened_at INTEGER NOT NULL,closed_at INTEGER NOT NULL,exit_reason TEXT NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_paper_action_trades_closed ON paper_action_trades(closed_at DESC)`)
  ]);
  const existing=await env.DB.prepare(`SELECT id FROM paper_action_state WHERE id=1`).first();
  if(!existing){const now=Date.now();await env.DB.prepare(`INSERT INTO paper_action_state(id,starting_cash,cash,started_at,updated_at) VALUES(1,?,?,?,?)`).bind(PAPER_ACTION_STARTING_CASH,PAPER_ACTION_STARTING_CASH,now,now).run();}
}

export async function runPaperActionCycle(env,{now=Date.now()}={}){
  await ensurePaperActionSchema(env);
  const [signals,quotes]=await Promise.all([listSignals(env),listRadarQuotes(env,24*60*60*1000,200)]),signalMap=new Map((signals||[]).map(row=>[row.symbol,row])),quoteMap=new Map((quotes||[]).map(row=>[row.symbol,row]));
  const closed=await reconcileOpenPositions(env,{now,signalMap,quoteMap}),opened=[];
  let positions=await listPositions(env),slots=Math.max(0,PAPER_ACTION_MAX_OPEN-positions.length);
  if(slots>0){
    const lastClosed=await lastClosedBySymbol(env),openSymbols=new Set(positions.map(row=>row.symbol)),candidates=(signals||[]).map(signal=>candidateFrom(signal,quoteMap.get(signal.symbol),now)).filter(Boolean).filter(row=>!openSymbols.has(row.symbol)).filter(row=>Number(row.signalUpdatedAt)>(lastClosed.get(row.symbol)||0)).sort((a,b)=>b.paperRank-a.paperRank);
    for(const candidate of candidates.slice(0,Math.min(1,slots))){const entry=await openPaperPosition(env,candidate,{now});if(entry){opened.push(entry);openSymbols.add(entry.symbol);}}
  }
  const snapshot=await getPaperActionSnapshot(env,{now,signals,quotes});
  await recordOperation(env,'paper-action-cycle',{status:opened.length||closed.length?'OK':snapshot.openPositions.length?'OK':'IDLE',at:now,detail:{opened:opened.map(x=>x.symbol),closed:closed.map(x=>({symbol:x.symbol,reason:x.exitReason,pnlPct:x.pnlPct})),openPositions:snapshot.openPositions.length,actionCandidates:snapshot.actionCandidates.slice(0,5).map(x=>({symbol:x.symbol,status:x.sourceStatus,readiness:x.readiness,gatesReady:x.gatesReady,rr:x.rr})),realTradingAuthority:false}});
  return{opened,closed,snapshot};
}

export async function getPaperActionSnapshot(env,{now=Date.now(),signals=null,quotes=null}={}){
  await ensurePaperActionSchema(env);
  const [state,positions,trades,resolvedSignals,resolvedQuotes]=await Promise.all([getState(env),listPositions(env),listTrades(env,30),signals?Promise.resolve(signals):listSignals(env),quotes?Promise.resolve(quotes):listRadarQuotes(env,24*60*60*1000,200)]),signalMap=new Map((resolvedSignals||[]).map(row=>[row.symbol,row])),quoteMap=new Map((resolvedQuotes||[]).map(row=>[row.symbol,row]));
  const openPositions=positions.map(position=>{const mark=usableMark(position.symbol,signalMap.get(position.symbol),quoteMap.get(position.symbol),now)||position.entryPrice,marketValue=mark*position.shares,unrealized=(mark-position.entryPrice)*position.shares;return{...position,mark,marketValue,unrealized,unrealizedPct:position.entryPrice>0?mark/position.entryPrice-1:0,currentStatus:String(signalMap.get(position.symbol)?.status||'UNKNOWN')};});
  const positionsValue=openPositions.reduce((sum,row)=>sum+row.marketValue,0),equity=state.cash+positionsValue,realizedPnl=trades.reduce((sum,row)=>sum+row.pnl,0),wins=trades.filter(row=>row.pnl>0).length,losses=trades.filter(row=>row.pnl<=0).length,lastClosed=await lastClosedBySymbol(env),openSymbols=new Set(openPositions.map(row=>row.symbol));
  const actionCandidates=(resolvedSignals||[]).map(signal=>candidateFrom(signal,quoteMap.get(signal.symbol),now)).filter(Boolean).filter(row=>!openSymbols.has(row.symbol)).filter(row=>Number(row.signalUpdatedAt)>(lastClosed.get(row.symbol)||0)).sort((a,b)=>b.paperRank-a.paperRank).slice(0,8);
  return{mode:'MARKETPULSE PAPER ACTION',startedAt:state.startedAt,startingCash:state.startingCash,cash:state.cash,equity,positionsValue,realizedPnl,unrealizedPnl:openPositions.reduce((sum,row)=>sum+row.unrealized,0),totalPnl:equity-state.startingCash,returnPct:state.startingCash>0?equity/state.startingCash-1:0,openPositions,closedTrades:trades,totalTrades:trades.length,wins,losses,winRate:trades.length?wins/trades.length:0,actionCandidates,rules:{maxOpen:PAPER_ACTION_MAX_OPEN,riskPerTrade:PAPER_ACTION_RISK_PER_TRADE,maxPositionPct:PAPER_ACTION_MAX_POSITION_PCT,minReadiness:PAPER_ACTION_MIN_READINESS,minRewardRisk:PAPER_ACTION_MIN_RR,oneNewEntryPerCycle:true,realTradingAuthority:false,entryRule:'Paper-only: test the strongest near-ready deep-analysis setups before full BUY NOW authorization. Requires trend confirmation, at least 3 ready engines, 70%+ readiness, 1.5:1+ reward/risk, valid stop/target, and no overextension.',exitRule:'Paper exit on thesis stop, structure target, or SignalForge SELL / EXIT. No real brokerage orders are placed.'}};
}

export function paperActionEligible({status='',analysis=null,price=0}={}){
  if(!analysis||typeof analysis!=='object')return{eligible:false,reason:'No deep analysis.'};
  const normalized=String(status||analysis.status||''),blocked=new Set(['AVOID','SELL / EXIT']);if(blocked.has(normalized))return{eligible:false,reason:`${normalized} is not testable.`};
  const engines=analysis.engines||{},gateRows=Object.values(engines).filter(Boolean),gatesReady=gateRows.filter(row=>row?.ready).length,readiness=Number(analysis.readiness)||0,current=positive(price)||positive(analysis.latest?.close),stop=positive(analysis.thesisBreak),target=positive(analysis.target),overextension=positive(analysis.overextension),rr=stop&&target&&current>stop?(target-current)/(current-stop):0,trendReady=engines?.trend?.ready===true;
  if(!(current>0&&stop>0&&target>current&&stop<current))return{eligible:false,reason:'A valid entry, stop, and target are required.',gatesReady,readiness,rr};
  if(!trendReady)return{eligible:false,reason:'Trend gate is not ready.',gatesReady,readiness,rr};
  if(gatesReady<3)return{eligible:false,reason:'Fewer than 3 of 4 engines are ready.',gatesReady,readiness,rr};
  if(readiness<PAPER_ACTION_MIN_READINESS)return{eligible:false,reason:`Readiness is below ${PAPER_ACTION_MIN_READINESS}%.`,gatesReady,readiness,rr};
  if(rr<PAPER_ACTION_MIN_RR)return{eligible:false,reason:`Reward/risk is below ${PAPER_ACTION_MIN_RR}:1.`,gatesReady,readiness,rr};
  if(overextension&&current>=overextension)return{eligible:false,reason:'Price is at or above the no-chase level.',gatesReady,readiness,rr};
  return{eligible:true,reason:normalized==='BUY NOW'&&analysis.hardBuyGuardrails?.pass===true?'Strict BUY NOW also passed; paper position mirrors the authorized setup.':'Near-ready setup qualifies for aggressive paper testing before strict BUY NOW.',gatesReady,readiness,rr,current,stop,target};
}

function candidateFrom(signal,quote,now){
  const price=usableMark(signal?.symbol,signal,quote,now);if(!(price>0))return null;const assessment=paperActionEligible({status:signal?.status,analysis:signal?.analysis,price});if(!assessment.eligible)return null;const rolling=Number(quote?.rollingDiscoveryScore??quote?.discoveryScore)||0,velocity=Number(quote?.scoreVelocity)||0,rank=assessment.readiness+assessment.gatesReady*12+Math.min(30,assessment.rr*5)+Math.max(0,rolling)*.35+Math.max(0,velocity)*.5;
  return{symbol:String(signal.symbol||'').toUpperCase(),sourceStatus:String(signal.status||signal.analysis?.status||''),readiness:assessment.readiness,gatesReady:assessment.gatesReady,rr:assessment.rr,price:assessment.current,stop:assessment.stop,target:assessment.target,reason:assessment.reason,paperRank:rank,signalUpdatedAt:Number(signal.updatedAt)||0};
}

async function openPaperPosition(env,candidate,{now}){
  const state=await getState(env),positions=await listPositions(env);if(positions.length>=PAPER_ACTION_MAX_OPEN||state.cash<=5)return null;const fill=candidate.price*(1+SLIPPAGE_PCT),equity=await paperEquity(env,positions,state.cash,now),riskBudget=equity*PAPER_ACTION_RISK_PER_TRADE,riskPerShare=Math.max(.01,fill-candidate.stop),maxAllocation=Math.min(state.cash,equity*PAPER_ACTION_MAX_POSITION_PCT),shares=Math.min(riskBudget/riskPerShare,maxAllocation/fill);if(!(shares>0.0001))return null;const cost=shares*fill;
  await env.DB.batch([env.DB.prepare(`INSERT INTO paper_action_positions(symbol,entry_price,shares,stop_price,target_price,opened_at,source_status,source_readiness,source_gates_ready,source_rr,source_signal_updated_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(candidate.symbol,fill,shares,candidate.stop,candidate.target,now,candidate.sourceStatus,candidate.readiness,candidate.gatesReady,candidate.rr,candidate.signalUpdatedAt,now),env.DB.prepare(`UPDATE paper_action_state SET cash=cash-?,updated_at=? WHERE id=1`).bind(cost,now)]);
  const opened={...candidate,entryPrice:fill,shares,cost,openedAt:now,action:'PAPER BUY — TESTING'};try{await broadcastPaperActionPush(env,{action:'OPEN',position:opened,occurredAt:now});}catch(error){console.error(JSON.stringify({event:'paper_action_push_error',symbol:candidate.symbol,message:error?.message||String(error)}));}return opened;
}

async function reconcileOpenPositions(env,{now,signalMap,quoteMap}){
  const closed=[];for(const position of await listPositions(env)){const signal=signalMap.get(position.symbol),mark=usableMark(position.symbol,signal,quoteMap.get(position.symbol),now);if(!(mark>0))continue;let reason=null,status=null;if(String(signal?.status||'')==='SELL / EXIT'){reason='SignalForge changed to SELL / EXIT.';status='SELL / EXIT';}else if(mark<=position.stopPrice){reason='Paper thesis stop reached.';status='STOP HIT';}else if(mark>=position.targetPrice){reason='Paper structure target reached.';status='TARGET HIT';}if(reason){const trade=await closePaperPosition(env,position,{mark,now,reason,status});if(trade)closed.push(trade);}}
  return closed;
}

async function closePaperPosition(env,position,{mark,now,reason,status}){const exit=mark*(1-SLIPPAGE_PCT),proceeds=position.shares*exit,pnl=(exit-position.entryPrice)*position.shares,pnlPct=position.entryPrice>0?exit/position.entryPrice-1:0;await env.DB.batch([env.DB.prepare(`INSERT INTO paper_action_trades(symbol,entry_price,exit_price,shares,pnl,pnl_pct,source_status,source_readiness,source_gates_ready,source_rr,opened_at,closed_at,exit_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(position.symbol,position.entryPrice,exit,position.shares,pnl,pnlPct,position.sourceStatus,position.sourceReadiness,position.sourceGatesReady,position.sourceRr,position.openedAt,now,`${status}: ${reason}`),env.DB.prepare(`DELETE FROM paper_action_positions WHERE symbol=?`).bind(position.symbol),env.DB.prepare(`UPDATE paper_action_state SET cash=cash+?,updated_at=? WHERE id=1`).bind(proceeds,now)]);const trade={symbol:position.symbol,entryPrice:position.entryPrice,exitPrice:exit,shares:position.shares,pnl,pnlPct,openedAt:position.openedAt,closedAt:now,exitStatus:status,exitReason:reason};try{await broadcastPaperActionPush(env,{action:'CLOSE',trade,occurredAt:now});}catch(error){console.error(JSON.stringify({event:'paper_action_push_error',symbol:position.symbol,message:error?.message||String(error)}));}return trade;}

async function paperEquity(env,positions,cash,now){const [signals,quotes]=await Promise.all([listSignals(env),listRadarQuotes(env,24*60*60*1000,200)]),signalMap=new Map(signals.map(row=>[row.symbol,row])),quoteMap=new Map(quotes.map(row=>[row.symbol,row]));return cash+positions.reduce((sum,row)=>sum+(usableMark(row.symbol,signalMap.get(row.symbol),quoteMap.get(row.symbol),now)||row.entryPrice)*row.shares,0);}
function usableMark(symbol,signal,quote,now){const quoteAt=Number(quote?.updatedAt)||0,signalAt=Number(signal?.updatedAt)||0;if(quoteAt&&now-quoteAt<=MAX_MARK_AGE_MS&&positive(quote?.price))return positive(quote.price);if(signalAt&&now-signalAt<=MAX_MARK_AGE_MS&&positive(signal?.analysis?.latest?.close))return positive(signal.analysis.latest.close);return 0;}
async function getState(env){const row=await env.DB.prepare(`SELECT starting_cash AS startingCash,cash,started_at AS startedAt,updated_at AS updatedAt FROM paper_action_state WHERE id=1`).first();return{startingCash:Number(row?.startingCash)||PAPER_ACTION_STARTING_CASH,cash:Number(row?.cash)||0,startedAt:Number(row?.startedAt)||0,updatedAt:Number(row?.updatedAt)||0};}
async function listPositions(env){const rows=await env.DB.prepare(`SELECT symbol,entry_price AS entryPrice,shares,stop_price AS stopPrice,target_price AS targetPrice,opened_at AS openedAt,source_status AS sourceStatus,source_readiness AS sourceReadiness,source_gates_ready AS sourceGatesReady,source_rr AS sourceRr,source_signal_updated_at AS sourceSignalUpdatedAt,updated_at AS updatedAt FROM paper_action_positions ORDER BY opened_at DESC`).all();return(rows.results||[]).map(row=>({...row,entryPrice:Number(row.entryPrice),shares:Number(row.shares),stopPrice:Number(row.stopPrice),targetPrice:Number(row.targetPrice),openedAt:Number(row.openedAt),sourceReadiness:Number(row.sourceReadiness),sourceGatesReady:Number(row.sourceGatesReady),sourceRr:Number(row.sourceRr),sourceSignalUpdatedAt:Number(row.sourceSignalUpdatedAt),updatedAt:Number(row.updatedAt)}));}
async function listTrades(env,limit){const rows=await env.DB.prepare(`SELECT id,symbol,entry_price AS entryPrice,exit_price AS exitPrice,shares,pnl,pnl_pct AS pnlPct,source_status AS sourceStatus,source_readiness AS sourceReadiness,source_gates_ready AS sourceGatesReady,source_rr AS sourceRr,opened_at AS openedAt,closed_at AS closedAt,exit_reason AS exitReason FROM paper_action_trades ORDER BY id DESC LIMIT ?`).bind(Math.max(1,Math.min(100,Number(limit)||30))).all();return(rows.results||[]).map(row=>({...row,id:Number(row.id),entryPrice:Number(row.entryPrice),exitPrice:Number(row.exitPrice),shares:Number(row.shares),pnl:Number(row.pnl),pnlPct:Number(row.pnlPct),sourceReadiness:Number(row.sourceReadiness),sourceGatesReady:Number(row.sourceGatesReady),sourceRr:Number(row.sourceRr),openedAt:Number(row.openedAt),closedAt:Number(row.closedAt)}));}
async function lastClosedBySymbol(env){const rows=await env.DB.prepare(`SELECT symbol,MAX(closed_at) AS lastClosedAt FROM paper_action_trades GROUP BY symbol`).all();return new Map((rows.results||[]).map(row=>[String(row.symbol||'').toUpperCase(),Number(row.lastClosedAt)||0]));}
function positive(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:0;}
