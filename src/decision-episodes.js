export const DECISION_EPISODE_MAX_GAP_MS=36*60*60*1000;
const TERMINAL_STATUSES=new Set(['AVOID','SELL / EXIT']);

export function buildDecisionEpisodes(rows=[],{maxGapMs=DECISION_EPISODE_MAX_GAP_MS}={}){
  const normalized=normalizeRows(rows),bySymbol=groupBySymbol(normalized),episodes=[];
  for(const symbolRows of bySymbol.values()){
    let active=null;
    for(const row of symbolRows){
      const same=Boolean(active&&active.status===row.status&&active.modelVersion===row.modelVersion&&continuous(active.lastObservedAt,row.observedAt,maxGapMs));
      if(!same){const episode={...row,episodeStartAt:row.observedAt,episodeEndAt:row.observedAt,episodeObservations:1,episodeSources:new Set([row.source].filter(Boolean))};episodes.push(episode);active={index:episodes.length-1,status:row.status,modelVersion:row.modelVersion,lastObservedAt:row.observedAt};continue;}
      const episode=episodes[active.index];episode.episodeEndAt=row.observedAt;episode.episodeObservations+=1;if(row.source)episode.episodeSources.add(row.source);active.lastObservedAt=row.observedAt;
    }
  }
  return episodes.sort(sortRows).map(row=>({...row,episodeSources:[...row.episodeSources]}));
}

export function buildSetupStateSamples(rows=[],{maxGapMs=DECISION_EPISODE_MAX_GAP_MS}={}){
  const normalized=normalizeRows(rows),bySymbol=groupBySymbol(normalized),samples=[];
  let setupSequence=0;
  for(const symbolRows of bySymbol.values()){
    let active=null;
    for(const row of symbolRows){
      const terminalTransition=Boolean(active?.terminalStatus&&row.status!==active.terminalStatus),sameSetup=Boolean(active&&active.modelVersion===row.modelVersion&&continuous(active.lastObservedAt,row.observedAt,maxGapMs)&&!terminalTransition);
      if(!sameSetup){setupSequence+=1;active={id:`setup-${setupSequence}`,symbol:row.symbol,modelVersion:row.modelVersion,startAt:row.observedAt,lastObservedAt:row.observedAt,endAt:row.observedAt,observationCount:0,stateFirst:new Set(),terminalStatus:null};}
      active.lastObservedAt=row.observedAt;active.endAt=row.observedAt;active.observationCount+=1;
      if(!active.stateFirst.has(row.status)){
        active.stateFirst.add(row.status);
        samples.push({...row,setupEpisodeId:active.id,setupStartAt:active.startAt,setupEndAt:active.endAt,setupStateFirstAt:row.observedAt});
      }
      if(TERMINAL_STATUSES.has(row.status))active.terminalStatus=row.status;
    }
  }
  return samples.sort(sortRows);
}

export function decisionEpisodeDiagnostics(rows=[],options={}){
  const episodes=buildDecisionEpisodes(rows,options),raw=(rows||[]).length;
  return{rawObservations:raw,episodeCount:episodes.length,collapsedObservations:Math.max(0,raw-episodes.length),policy:'Repeated observations for the same symbol, decision status, and model version remain one decision-state episode until the status/model changes or the observation gap exceeds 36 hours.'};
}

export function setupThesisDiagnostics(rows=[],options={}){
  const samples=buildSetupStateSamples(rows,options),setupIds=new Set(samples.map(row=>row.setupEpisodeId)),raw=(rows||[]).length;
  return{rawObservations:raw,setupEpisodeCount:setupIds.size,stateSampleCount:samples.length,collapsedObservations:Math.max(0,raw-samples.length),policy:'A continuous ticker/model thesis may contribute at most one validation sample per decision state. State flicker such as BUY → READY → BUY does not create a second BUY sample. A model change, gap over 36 hours, or transition away from a terminal AVOID/SELL state starts a new setup thesis.'};
}

function normalizeRows(rows){return(rows||[]).map((row,index)=>normalize(row,index)).filter(row=>row.symbol&&row.status&&Number.isFinite(row.observedAt)).sort(sortRows);}
function groupBySymbol(rows){const bySymbol=new Map();for(const row of rows){if(!bySymbol.has(row.symbol))bySymbol.set(row.symbol,[]);bySymbol.get(row.symbol).push(row);}return bySymbol;}
function continuous(previous,current,maxGapMs){const gap=current-previous;return gap>=0&&gap<=maxGapMs;}
function normalize(row,index){
  let payload={};try{payload=row?.payload||JSON.parse(row?.payloadJson||'{}');}catch{}
  const observedAt=numberOrNaN(row?.observedAt??row?.observed_at??payload?.observedAt??index),symbol=String(row?.symbol||payload?.symbol||`__ROW_${index}`).trim().toUpperCase();
  return{...row,payload,symbol,status:String(row?.status||payload?.status||'').trim(),modelVersion:String(row?.modelVersion||row?.model_version||payload?.modelVersion||'UNKNOWN'),source:String(row?.source||payload?.source||''),observedAt};
}
function sortRows(a,b){return String(a.symbol).localeCompare(String(b.symbol))||Number(a.observedAt)-Number(b.observedAt);}
function numberOrNaN(v){const n=Number(v);return Number.isFinite(n)?n:Number.NaN;}
