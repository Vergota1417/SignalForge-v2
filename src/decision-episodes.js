export const DECISION_EPISODE_MAX_GAP_MS=36*60*60*1000;

export function buildDecisionEpisodes(rows=[],{maxGapMs=DECISION_EPISODE_MAX_GAP_MS}={}){
  const normalized=(rows||[]).map((row,index)=>normalize(row,index)).filter(row=>row.symbol&&row.status&&Number.isFinite(row.observedAt)).sort(sortRows);
  const bySymbol=new Map();for(const row of normalized){if(!bySymbol.has(row.symbol))bySymbol.set(row.symbol,[]);bySymbol.get(row.symbol).push(row);}
  const episodes=[];
  for(const symbolRows of bySymbol.values()){
    let active=null;
    for(const row of symbolRows){
      const same=Boolean(active&&active.status===row.status&&active.modelVersion===row.modelVersion&&row.observedAt-active.lastObservedAt>=0&&row.observedAt-active.lastObservedAt<=maxGapMs);
      if(!same){const episode={...row,episodeStartAt:row.observedAt,episodeEndAt:row.observedAt,episodeObservations:1,episodeSources:new Set([row.source].filter(Boolean))};episodes.push(episode);active={index:episodes.length-1,status:row.status,modelVersion:row.modelVersion,lastObservedAt:row.observedAt};continue;}
      const episode=episodes[active.index];episode.episodeEndAt=row.observedAt;episode.episodeObservations+=1;if(row.source)episode.episodeSources.add(row.source);active.lastObservedAt=row.observedAt;
    }
  }
  return episodes.sort(sortRows).map(row=>({...row,episodeSources:[...row.episodeSources]}));
}

export function decisionEpisodeDiagnostics(rows=[],options={}){
  const episodes=buildDecisionEpisodes(rows,options),raw=(rows||[]).length;
  return{rawObservations:raw,episodeCount:episodes.length,collapsedObservations:Math.max(0,raw-episodes.length),policy:'Repeated observations for the same symbol, decision status, and model version remain one decision-state episode until the status/model changes or the observation gap exceeds 36 hours.'};
}

function normalize(row,index){
  let payload={};try{payload=row?.payload||JSON.parse(row?.payloadJson||'{}');}catch{}
  const observedAt=numberOrNaN(row?.observedAt??row?.observed_at??payload?.observedAt??index),symbol=String(row?.symbol||payload?.symbol||`__ROW_${index}`).trim().toUpperCase();
  return{...row,payload,symbol,status:String(row?.status||payload?.status||'').trim(),modelVersion:String(row?.modelVersion||row?.model_version||payload?.modelVersion||'UNKNOWN'),source:String(row?.source||payload?.source||''),observedAt};
}
function sortRows(a,b){return String(a.symbol).localeCompare(String(b.symbol))||Number(a.observedAt)-Number(b.observedAt);}
function numberOrNaN(v){const n=Number(v);return Number.isFinite(n)?n:Number.NaN;}
