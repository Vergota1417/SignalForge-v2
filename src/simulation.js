import { listSignals } from './db.js';

const STARTING_CASH=300;
const LEGACY_STARTING_CASH=10_000;
const RISK_PER_TRADE=.01;
const MAX_POSITION_PCT=.25;
const SLIPPAGE_PCT=.0005;

export async function ensureSimulationSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_sim_state (
      id INTEGER PRIMARY KEY CHECK(id=1),
      starting_cash REAL NOT NULL,
      cash REAL NOT NULL,
      last_signal_event_id INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_positions (
      symbol TEXT PRIMARY KEY,
      entry_price REAL NOT NULL,
      shares REAL NOT NULL,
      entry_signal_price REAL NOT NULL,
      stop_price REAL NOT NULL,
      target_price REAL NOT NULL,
      opened_at INTEGER NOT NULL,
      signal_event_id INTEGER NOT NULL,
      entry_readiness REAL NOT NULL DEFAULT 0,
      entry_status TEXT NOT NULL DEFAULT 'BUY NOW',
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      shares REAL NOT NULL,
      pnl REAL NOT NULL,
      pnl_pct REAL NOT NULL,
      entry_status TEXT NOT NULL,
      exit_status TEXT NOT NULL,
      entry_readiness REAL NOT NULL DEFAULT 0,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER NOT NULL,
      entry_signal_event_id INTEGER NOT NULL,
      exit_signal_event_id INTEGER,
      exit_reason TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_equity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equity REAL NOT NULL,
      cash REAL NOT NULL,
      positions_value REAL NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS paper_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`)
  ]);
  await ensureState(env);
  await migrateUntouchedLegacyAccount(env);
}

async function ensureState(env){
  const existing=await env.DB.prepare(`SELECT id FROM paper_sim_state WHERE id=1`).first();
  if(existing)return;
  const latest=await env.DB.prepare(`SELECT COALESCE(MAX(id),0) AS maxId FROM signal_events`).first();
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO paper_sim_state(id,starting_cash,cash,last_signal_event_id,started_at,updated_at) VALUES(1,?,?,?,?,?)`)
    .bind(STARTING_CASH,STARTING_CASH,Number(latest?.maxId)||0,now,now).run();
  await env.DB.prepare(`INSERT INTO paper_equity_snapshots(equity,cash,positions_value,created_at) VALUES(?,?,0,?)`)
    .bind(STARTING_CASH,STARTING_CASH,now).run();
}

async function migrateUntouchedLegacyAccount(env){
  const state=await getState(env);
  if(Math.abs(state.startingCash-LEGACY_STARTING_CASH)>.01)return;
  const [tradeCount,positionCount,contributionCount]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM paper_trades`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM paper_positions`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM paper_contributions`).first()
  ]);
  if(Number(tradeCount?.count)||Number(positionCount?.count)||Number(contributionCount?.count))return;
  const now=Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE paper_sim_state SET starting_cash=?,cash=?,updated_at=? WHERE id=1`).bind(STARTING_CASH,STARTING_CASH,now),
    env.DB.prepare(`DELETE FROM paper_equity_snapshots`),
    env.DB.prepare(`INSERT INTO paper_equity_snapshots(equity,cash,positions_value,created_at) VALUES(?,?,0,?)`).bind(STARTING_CASH,STARTING_CASH,now)
  ]);
}

export async function setStartingCapital(env,amount,{now=Date.now()}={}){
  await ensureSimulationSchema(env);
  const value=moneyAmount(amount,1,1_000_000);
  const [trades,positions,contributions]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM paper_trades`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM paper_positions`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM paper_contributions`).first()
  ]);
  if(Number(trades?.count)||Number(positions?.count)||Number(contributions?.count))throw new Error('Starting capital is locked after the paper test begins. Add a contribution instead.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE paper_sim_state SET starting_cash=?,cash=?,updated_at=? WHERE id=1`).bind(value,value,now),
    env.DB.prepare(`DELETE FROM paper_equity_snapshots`),
    env.DB.prepare(`INSERT INTO paper_equity_snapshots(equity,cash,positions_value,created_at) VALUES(?,?,0,?)`).bind(value,value,now)
  ]);
  return getSimulationSnapshot(env);
}

export async function addSimulationContribution(env,amount,{note='',now=Date.now()}={}){
  await ensureSimulationSchema(env);
  const value=moneyAmount(amount,.01,1_000_000);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO paper_contributions(amount,note,created_at) VALUES(?,?,?)`).bind(value,String(note||'').slice(0,200),now),
    env.DB.prepare(`UPDATE paper_sim_state SET cash=cash+?,updated_at=? WHERE id=1`).bind(value,now)
  ]);
  await saveEquitySnapshot(env,now,true);
  return getSimulationSnapshot(env);
}

export async function runPaperSimulation(env,{now=Date.now()}={}){
  await ensureSimulationSchema(env);
  const state=await getState(env);
  const events=await env.DB.prepare(`SELECT id,symbol,status,readiness,price,analysis_json AS analysisJson,created_at AS createdAt FROM signal_events WHERE id>? ORDER BY id ASC LIMIT 200`)
    .bind(state.lastSignalEventId).all();
  let lastId=state.lastSignalEventId;
  for(const event of events.results||[]){await processEvent(env,event);lastId=Math.max(lastId,Number(event.id)||0);}
  if(lastId!==state.lastSignalEventId)await env.DB.prepare(`UPDATE paper_sim_state SET last_signal_event_id=?,updated_at=? WHERE id=1`).bind(lastId,now).run();
  await reconcileOpenPositions(env,{now});
  await saveEquitySnapshot(env,now);
  return getSimulationSnapshot(env);
}

async function processEvent(env,event){
  const symbol=String(event.symbol||'').toUpperCase(),status=String(event.status||'');if(!symbol)return;
  let analysis=null;try{analysis=JSON.parse(event.analysisJson||'{}');}catch{}
  const open=await env.DB.prepare(`SELECT symbol FROM paper_positions WHERE symbol=?`).bind(symbol).first();
  if(status==='BUY NOW'&&!open)await openPosition(env,{event,analysis});
  else if(status==='SELL / EXIT'&&open)await closePosition(env,symbol,{signalPrice:Number(event.price),status,eventId:Number(event.id)||null,reason:'SignalForge changed to SELL / EXIT.',closedAt:Number(event.createdAt)||Date.now()});
}

async function openPosition(env,{event,analysis}){
  const state=await getState(env),signalPrice=positive(event.price);if(!(signalPrice>0)||!(state.cash>5))return;
  const stop=positive(analysis?.thesisBreak),target=positive(analysis?.target);if(!(stop>0&&stop<signalPrice&&target>signalPrice))return;
  const fill=signalPrice*(1+SLIPPAGE_PCT),riskPerShare=Math.max(.01,fill-stop),equity=await currentEquity(env),riskBudget=Math.max(0,equity*RISK_PER_TRADE),maxAllocation=Math.max(0,equity*MAX_POSITION_PCT),sharesByRisk=riskBudget/riskPerShare,sharesByCap=Math.min(maxAllocation,state.cash)/fill,shares=Math.max(0,Math.min(sharesByRisk,sharesByCap));if(!(shares>0.0001))return;
  const cost=shares*fill,now=Number(event.createdAt)||Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO paper_positions(symbol,entry_price,shares,entry_signal_price,stop_price,target_price,opened_at,signal_event_id,entry_readiness,entry_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(String(event.symbol),fill,shares,signalPrice,stop,target,now,Number(event.id)||0,Number(event.readiness)||0,String(event.status||'BUY NOW'),now),
    env.DB.prepare(`UPDATE paper_sim_state SET cash=cash-?,updated_at=? WHERE id=1`).bind(cost,now)
  ]);
}

async function reconcileOpenPositions(env,{now=Date.now()}={}){
  const [positions,signals]=await Promise.all([listPositions(env),listSignals(env)]),signalMap=new Map(signals.map(row=>[row.symbol,row]));
  for(const position of positions){const signal=signalMap.get(position.symbol),price=positive(signal?.price||signal?.analysis?.latest?.close);if(!(price>0))continue;if(signal?.status==='SELL / EXIT'||price<=position.stopPrice)await closePosition(env,position.symbol,{signalPrice:price,status:'SELL / EXIT',eventId:null,reason:price<=position.stopPrice?'Paper stop/thesis level reached.':'SignalForge changed to SELL / EXIT.',closedAt:now});else if(price>=position.targetPrice)await closePosition(env,position.symbol,{signalPrice:price,status:'TARGET HIT',eventId:null,reason:'Paper structure target reached.',closedAt:now});}
}

async function closePosition(env,symbol,{signalPrice,status,eventId,reason,closedAt}){
  const p=await env.DB.prepare(`SELECT symbol,entry_price AS entryPrice,shares,entry_status AS entryStatus,entry_readiness AS entryReadiness,opened_at AS openedAt,signal_event_id AS signalEventId FROM paper_positions WHERE symbol=?`).bind(symbol).first();if(!p)return;
  const market=positive(signalPrice);if(!(market>0))return;const exit=market*(1-SLIPPAGE_PCT),proceeds=Number(p.shares)*exit,pnl=(exit-Number(p.entryPrice))*Number(p.shares),pnlPct=Number(p.entryPrice)>0?exit/Number(p.entryPrice)-1:0,now=Number(closedAt)||Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO paper_trades(symbol,entry_price,exit_price,shares,pnl,pnl_pct,entry_status,exit_status,entry_readiness,opened_at,closed_at,entry_signal_event_id,exit_signal_event_id,exit_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(symbol,Number(p.entryPrice),exit,Number(p.shares),pnl,pnlPct,String(p.entryStatus),String(status),Number(p.entryReadiness)||0,Number(p.openedAt),now,Number(p.signalEventId),eventId,reason),
    env.DB.prepare(`DELETE FROM paper_positions WHERE symbol=?`).bind(symbol),
    env.DB.prepare(`UPDATE paper_sim_state SET cash=cash+?,updated_at=? WHERE id=1`).bind(proceeds,now)
  ]);
}

async function saveEquitySnapshot(env,now,force=false){
  const state=await getState(env),positions=await listPositions(env),signals=await listSignals(env),signalMap=new Map(signals.map(row=>[row.symbol,row])),positionsValue=positions.reduce((sum,p)=>sum+p.shares*positive(signalMap.get(p.symbol)?.price||p.entryPrice),0),equity=state.cash+positionsValue,last=await env.DB.prepare(`SELECT created_at AS createdAt FROM paper_equity_snapshots ORDER BY id DESC LIMIT 1`).first();
  if(force||!last||now-Number(last.createdAt)>=15*60*1000)await env.DB.prepare(`INSERT INTO paper_equity_snapshots(equity,cash,positions_value,created_at) VALUES(?,?,?,?)`).bind(equity,state.cash,positionsValue,now).run();
}

export async function getSimulationSnapshot(env){
  await ensureSimulationSchema(env);
  const [state,positions,trades,signals,equityRows,contributionRows]=await Promise.all([getState(env),listPositions(env),listTrades(env,100),listSignals(env),env.DB.prepare(`SELECT equity,created_at AS createdAt FROM paper_equity_snapshots ORDER BY id ASC LIMIT 2000`).all(),env.DB.prepare(`SELECT id,amount,note,created_at AS createdAt FROM paper_contributions ORDER BY id DESC LIMIT 100`).all()]);
  const signalMap=new Map(signals.map(row=>[row.symbol,row]));
  const open=positions.map(p=>{const mark=positive(signalMap.get(p.symbol)?.price||p.entryPrice),marketValue=p.shares*mark,unrealized=(mark-p.entryPrice)*p.shares;return{...p,mark,marketValue,unrealized,unrealizedPct:p.entryPrice>0?mark/p.entryPrice-1:0,currentStatus:signalMap.get(p.symbol)?.status||'UNKNOWN'};});
  const positionsValue=open.reduce((sum,p)=>sum+p.marketValue,0),equity=state.cash+positionsValue,wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<=0),grossWins=wins.reduce((s,t)=>s+t.pnl,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.pnl,0)),realized=trades.reduce((s,t)=>s+t.pnl,0),unrealized=open.reduce((s,p)=>s+p.unrealized,0),contributions=(contributionRows.results||[]).map(r=>({id:Number(r.id),amount:Number(r.amount)||0,note:String(r.note||''),createdAt:Number(r.createdAt)||0})),contributed=contributions.reduce((s,r)=>s+r.amount,0),netDeposits=state.startingCash+contributed,strategyPnl=equity-netDeposits,curve=(equityRows.results||[]).map(r=>({equity:Number(r.equity)||0,createdAt:Number(r.createdAt)||0}));
  let peak=0,maxDrawdown=0;for(const row of curve){peak=Math.max(peak,row.equity);if(peak>0)maxDrawdown=Math.min(maxDrawdown,row.equity/peak-1);}
  const capitalLocked=Boolean(trades.length||open.length||contributions.length);
  return {mode:'FORWARD PAPER TEST',startedAt:state.startedAt,startingCash:state.startingCash,contributions,contributed,netDeposits,capitalLocked,cash:state.cash,equity,positionsValue,realizedPnl:realized,unrealizedPnl:unrealized,totalPnl:strategyPnl,strategyPnl,returnPct:netDeposits>0?strategyPnl/netDeposits:0,openPositions:open,closedTrades:trades,totalTrades:trades.length,wins:wins.length,losses:losses.length,winRate:trades.length?wins.length/trades.length:0,profitFactor:grossLoss>0?grossWins/grossLoss:(grossWins>0?null:0),maxDrawdown,curve,assumptions:{riskPerTrade:RISK_PER_TRADE,maxPositionPct:MAX_POSITION_PCT,slippagePct:SLIPPAGE_PCT,commission:0,entryRule:'Open only on a new BUY NOW signal.',exitRule:'Exit on SELL / EXIT, fixed thesis stop, or fixed structure target.',lookAhead:false}};
}

async function currentEquity(env){const snap=await getSimulationSnapshot(env);return snap.equity;}
async function getState(env){const row=await env.DB.prepare(`SELECT starting_cash AS startingCash,cash,last_signal_event_id AS lastSignalEventId,started_at AS startedAt,updated_at AS updatedAt FROM paper_sim_state WHERE id=1`).first();return{startingCash:Number(row?.startingCash)||STARTING_CASH,cash:Number(row?.cash)||0,lastSignalEventId:Number(row?.lastSignalEventId)||0,startedAt:Number(row?.startedAt)||0,updatedAt:Number(row?.updatedAt)||0};}
async function listPositions(env){const rows=await env.DB.prepare(`SELECT symbol,entry_price AS entryPrice,shares,entry_signal_price AS entrySignalPrice,stop_price AS stopPrice,target_price AS targetPrice,opened_at AS openedAt,signal_event_id AS signalEventId,entry_readiness AS entryReadiness,entry_status AS entryStatus,updated_at AS updatedAt FROM paper_positions ORDER BY opened_at DESC`).all();return(rows.results||[]).map(r=>({...r,entryPrice:Number(r.entryPrice),shares:Number(r.shares),entrySignalPrice:Number(r.entrySignalPrice),stopPrice:Number(r.stopPrice),targetPrice:Number(r.targetPrice),openedAt:Number(r.openedAt),signalEventId:Number(r.signalEventId),entryReadiness:Number(r.entryReadiness)||0,updatedAt:Number(r.updatedAt)||0}));}
async function listTrades(env,limit=100){const rows=await env.DB.prepare(`SELECT id,symbol,entry_price AS entryPrice,exit_price AS exitPrice,shares,pnl,pnl_pct AS pnlPct,entry_status AS entryStatus,exit_status AS exitStatus,entry_readiness AS entryReadiness,opened_at AS openedAt,closed_at AS closedAt,entry_signal_event_id AS entrySignalEventId,exit_signal_event_id AS exitSignalEventId,exit_reason AS exitReason FROM paper_trades ORDER BY id DESC LIMIT ?`).bind(limit).all();return(rows.results||[]).map(r=>({...r,id:Number(r.id),entryPrice:Number(r.entryPrice),exitPrice:Number(r.exitPrice),shares:Number(r.shares),pnl:Number(r.pnl),pnlPct:Number(r.pnlPct),entryReadiness:Number(r.entryReadiness)||0,openedAt:Number(r.openedAt),closedAt:Number(r.closedAt)}));}
function moneyAmount(v,min,max){const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw new Error(`Amount must be between $${min} and $${max}.`);return Math.round(n*100)/100;}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
