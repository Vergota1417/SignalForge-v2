import { benchmarkContextFor } from './benchmark-context.js';

const FIFTEEN_MINUTES=15*60*1000;
export const ANALYSIS_MODEL_VERSION='sf-analysis-v2-participation';

export async function ensureEvidenceSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS evidence_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      observation_type TEXT NOT NULL,
      source TEXT NOT NULL,
      timeframe TEXT NOT NULL DEFAULT '',
      model_version TEXT NOT NULL DEFAULT '',
      observed_at INTEGER NOT NULL,
      observed_bucket INTEGER NOT NULL,
      price REAL,
      change_pct REAL,
      status TEXT,
      readiness REAL,
      discovery_score REAL,
      score_velocity REAL,
      relative_volume REAL,
      dollar_volume REAL,
      gates_ready INTEGER,
      gate_total INTEGER,
      trend_ready INTEGER,
      entry_ready INTEGER,
      probability_ready INTEGER,
      risk_reward_ready INTEGER,
      preferred_entry_low REAL,
      preferred_entry_high REAL,
      overextension REAL,
      thesis_break REAL,
      target REAL,
      rr REAL,
      benchmark_symbol TEXT,
      benchmark_bull INTEGER,
      benchmark_risk_off INTEGER,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      UNIQUE(symbol,observation_type,source,observed_bucket)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_evidence_symbol_time ON evidence_observations(symbol,observed_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_evidence_type_time ON evidence_observations(observation_type,observed_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_evidence_status_time ON evidence_observations(status,observed_at DESC)`)
  ]);
}

export async function recordRadarEvidence(env,quote,{source='radar',now=Date.now()}={}){
  await ensureEvidenceSchema(env);
  const row=radarEvidenceRow(quote,{source,now});
  if(!row.symbol)return null;
  await env.DB.prepare(`INSERT OR IGNORE INTO evidence_observations(
    symbol,observation_type,source,timeframe,model_version,observed_at,observed_bucket,
    price,change_pct,status,discovery_score,score_velocity,relative_volume,dollar_volume,payload_json,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    row.symbol,row.observationType,row.source,row.timeframe,row.modelVersion,row.observedAt,row.observedBucket,
    row.price,row.changePct,row.status,row.discoveryScore,row.scoreVelocity,row.relativeVolume,row.dollarVolume,JSON.stringify(row.payload),Date.now()
  ).run();
  return row;
}

export async function recordAnalysisEvidence(env,analysis,{source='deep-analysis',timeframe='6M',quote=null,now=Date.now(),modelVersion=ANALYSIS_MODEL_VERSION,benchmarkContext=null}={}){
  await ensureEvidenceSchema(env);
  const row=analysisEvidenceRow(analysis,{source,timeframe,quote,now,modelVersion,benchmarkContext});
  if(!row.symbol)return null;
  await env.DB.prepare(`INSERT OR IGNORE INTO evidence_observations(
    symbol,observation_type,source,timeframe,model_version,observed_at,observed_bucket,
    price,change_pct,status,readiness,discovery_score,score_velocity,relative_volume,dollar_volume,
    gates_ready,gate_total,trend_ready,entry_ready,probability_ready,risk_reward_ready,
    preferred_entry_low,preferred_entry_high,overextension,thesis_break,target,rr,
    benchmark_symbol,benchmark_bull,benchmark_risk_off,payload_json,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    row.symbol,row.observationType,row.source,row.timeframe,row.modelVersion,row.observedAt,row.observedBucket,
    row.price,row.changePct,row.status,row.readiness,row.discoveryScore,row.scoreVelocity,row.relativeVolume,row.dollarVolume,
    row.gatesReady,row.gateTotal,boolInt(row.trendReady),boolInt(row.entryReady),boolInt(row.probabilityReady),boolInt(row.riskRewardReady),
    row.preferredEntryLow,row.preferredEntryHigh,row.overextension,row.thesisBreak,row.target,row.rr,
    row.benchmarkSymbol,boolInt(row.benchmarkBull),boolInt(row.benchmarkRiskOff),JSON.stringify(row.payload),Date.now()
  ).run();
  return row;
}

export async function getEvidenceStatus(env){
  await ensureEvidenceSchema(env);
  const [total,types,symbols,last]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM evidence_observations`).first(),
    env.DB.prepare(`SELECT observation_type AS observationType,COUNT(*) AS count FROM evidence_observations GROUP BY observation_type ORDER BY observation_type`).all(),
    env.DB.prepare(`SELECT COUNT(DISTINCT symbol) AS count FROM evidence_observations`).first(),
    env.DB.prepare(`SELECT symbol,observation_type AS observationType,source,observed_at AS observedAt FROM evidence_observations ORDER BY observed_at DESC,id DESC LIMIT 1`).first()
  ]);
  return{totalObservations:Number(total?.count)||0,distinctSymbols:Number(symbols?.count)||0,byType:Object.fromEntries((types.results||[]).map(r=>[r.observationType,Number(r.count)||0])),lastObservation:last?{...last,observedAt:Number(last.observedAt)||0}:null,modelVersion:ANALYSIS_MODEL_VERSION};
}

export function radarEvidenceRow(quote,{source='radar',now=Date.now()}={}){
  const symbol=sanitizeSymbol(quote?.symbol),movement=quote?.earlyMovement||null;
  return{
    symbol,observationType:'RADAR',source:String(source||'radar'),timeframe:'QUOTE',modelVersion:'sf-early-movement-v1',observedAt:Number(now)||Date.now(),observedBucket:bucket(now),
    price:numOrNull(quote?.price),changePct:numOrNull(quote?.changePct),status:String(movement?.state||'QUIET'),discoveryScore:numOrNull(quote?.rollingDiscoveryScore??quote?.discoveryScore??quote?.score),scoreVelocity:numOrNull(quote?.scoreVelocity),relativeVolume:numOrNull(quote?.relativeVolume),dollarVolume:numOrNull(quote?.dollarVolume??(Number(quote?.price)||0)*(Number(quote?.volume)||0)),
    payload:{name:String(quote?.name||''),exchange:String(quote?.exchange||''),volume:numOrNull(quote?.volume),averageVolume:numOrNull(quote?.averageVolume),earlyMovement:movement?{state:String(movement.state||'QUIET'),acceleration:numOrNull(movement.acceleration),confirmations:Number(movement.confirmations)||0,reasons:Array.isArray(movement.reasons)?movement.reasons:[],action:String(movement.action||'')}:null}
  };
}

export function analysisEvidenceRow(analysis,{source='deep-analysis',timeframe='6M',quote=null,now=Date.now(),modelVersion=ANALYSIS_MODEL_VERSION,benchmarkContext=null}={}){
  const engines=analysis?.engines||{},gateList=Object.values(engines).filter(Boolean),symbol=sanitizeSymbol(analysis?.symbol),resolvedBenchmarkContext=normalizeBenchmarkContext(benchmarkContext)||benchmarkContextFor(symbol),participation=analysis?.intradayConfirmation||null;
  const gatesReady=gateList.filter(x=>x?.ready).length,gateTotal=gateList.length||4;
  return{
    symbol,observationType:'ANALYSIS',source:String(source||'deep-analysis'),timeframe:String(timeframe||''),modelVersion:String(modelVersion||ANALYSIS_MODEL_VERSION),observedAt:Number(now)||Date.now(),observedBucket:bucket(now),price:numOrNull(analysis?.latest?.close),changePct:numOrNull(analysis?.changePct),status:String(analysis?.status||''),readiness:numOrNull(analysis?.readiness),
    discoveryScore:numOrNull(quote?.rollingDiscoveryScore??quote?.discoveryScore??quote?.score),scoreVelocity:numOrNull(quote?.scoreVelocity),relativeVolume:numOrNull(quote?.relativeVolume),dollarVolume:numOrNull(quote?.dollarVolume),gatesReady,gateTotal,trendReady:Boolean(engines?.trend?.ready),entryReady:Boolean(engines?.entry?.ready),probabilityReady:Boolean(engines?.probability?.ready),riskRewardReady:Boolean(engines?.riskReward?.ready),preferredEntryLow:numOrNull(analysis?.preferredEntryLow),preferredEntryHigh:numOrNull(analysis?.preferredEntryHigh),overextension:numOrNull(analysis?.overextension),thesisBreak:numOrNull(analysis?.thesisBreak),target:numOrNull(analysis?.target),rr:numOrNull(analysis?.rr),benchmarkSymbol:String(analysis?.benchmark?.symbol||resolvedBenchmarkContext.marketBenchmark||''),benchmarkBull:analysis?.benchmark?Boolean(analysis.benchmark.bull):null,benchmarkRiskOff:analysis?.benchmark?Boolean(analysis.benchmark.riskOff):null,
    payload:{
      benchmarkContext:resolvedBenchmarkContext,
      criticalFailed:Array.isArray(analysis?.criticalFailed)?analysis.criticalFailed:[],
      reason:String(analysis?.reason||''),
      wf:{sample:Number(analysis?.wf?.sample)||0,winRate:numOrNull(analysis?.wf?.winRate),avgReturn:numOrNull(analysis?.wf?.avgReturn)},
      features:{sma20:numOrNull(analysis?.sma20),sma50:numOrNull(analysis?.sma50),atr:numOrNull(analysis?.atr),rsi:numOrNull(analysis?.rsi),momentum20:numOrNull(analysis?.momentum20),relativeStrength20:numOrNull(analysis?.relativeStrength20),extensionPct:numOrNull(analysis?.extensionPct),pullbackDepth:numOrNull(analysis?.pullbackDepth),trendStrength:numOrNull(analysis?.trendStrength)},
      participation:participation?{pass:Boolean(participation.pass),state:String(participation.state||''),passes:Number(participation.passes)||0,total:Number(participation.total)||5,participationPass:Boolean(participation.participationPass),relativeVolume:numOrNull(participation.relativeVolume),rvolSample:Number(participation.rvolSample)||0,avwap:numOrNull(participation.avwap),momentum4:numOrNull(participation.momentum4),rsi15:numOrNull(participation.rsi),sma20_15m:numOrNull(participation.sma20),latestPrice:numOrNull(participation.latestPrice),latestTime:numOrNull(participation.latestTime),volatility:participation.volatility||null,metrics:Array.isArray(participation.metrics)?participation.metrics.map(m=>({name:String(m.name||''),value:String(m.value||''),pass:Boolean(m.pass),warn:Boolean(m.warn),role:String(m.role||'')})):[]}:null,
      thresholds:{rewardRiskMin:1.8,walkForwardWinRateMin:.57,dailyRsiMin:42,dailyRsiMax:69,participationRvolMin:1.0,participationMomentumMin:0,participationTotalPassesMin:4}
    }
  };
}

function normalizeBenchmarkContext(value){if(!value||typeof value!=='object')return null;return{...value,industryRelativeStrength:numOrNull(value.industryRelativeStrength),sectorRelativeStrength:numOrNull(value.sectorRelativeStrength),marketRelativeStrength:numOrNull(value.marketRelativeStrength)};}
function bucket(now){const n=Number(now)||Date.now();return Math.floor(n/FIFTEEN_MINUTES)*FIFTEEN_MINUTES;}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function numOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function boolInt(v){return v===null||v===undefined?null:(v?1:0);}
