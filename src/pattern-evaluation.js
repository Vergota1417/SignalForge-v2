export function evaluatePatternEvidenceRows(rows,{horizon=10,minSample=20}={}){
  const required=Math.max(5,Number(minSample)||20),normalized=(rows||[]).map(normalizePatternRow).filter(Boolean),structureRows=dedupeStructureRows(normalized),patternDayRows=dedupePatternRows(structureRows.filter(row=>row.primaryPattern)),episodeRows=buildPatternEpisodes(structureRows),stateEpisodeRows=buildPatternStateEpisodes(structureRows);
  const patternSegments={
    primaryPattern:segment(episodeRows,row=>row.primaryPattern),
    patternState:segment(stateEpisodeRows,row=>`${row.primaryPattern} · ${row.primaryState||'UNKNOWN'}`),
    family:segment(episodeRows,row=>row.primaryFamily||'UNKNOWN'),
    bias:segment(episodeRows,row=>row.primaryBias||'UNKNOWN'),
    confidence:segment(episodeRows,row=>confidenceBand(row.primaryConfidence))
  };
  const structureSegments={
    breakoutState:segment(structureRows,row=>row.breakoutState||'INSIDE'),
    channelType:segment(structureRows,row=>row.channelType||'NO CLEAR CHANNEL'),
    structureState:segment(structureRows,row=>row.structureState||'STRUCTURE')
  };
  const qualifiedPatternSegments=Object.fromEntries(Object.entries(patternSegments).map(([key,value])=>[key,value.filter(item=>item.sampleSize>=required)]));
  const reviewCandidates=(qualifiedPatternSegments.patternState||[]).filter(item=>candidateMetrics(item)).map(item=>({...item,reviewOnly:true,productionEnabled:false}));
  const status=episodeRows.length<required?'COLLECTING':reviewCandidates.length?'REVIEW CANDIDATES':'VALIDATING';
  return{
    horizon:Number(horizon)||10,
    minSample:required,
    status,
    sampleSize:episodeRows.length,
    patternDaySampleSize:patternDayRows.length,
    stateEpisodeSampleSize:stateEpisodeRows.length,
    structureSampleSize:structureRows.length,
    dedupePolicy:'Primary validation uses one observation per pattern setup episode. An episode continues while the same symbol keeps the same primary pattern on consecutive observed structure sessions, closes when the pattern disappears/changes, and is forcibly reset after a gap longer than 7 calendar days. Pattern-state cohorts count the first observation of each state within an episode.',
    overall:metrics(episodeRows),
    patternSegments,
    structureSegments,
    qualifiedPatternSegments,
    reviewCandidates,
    guard:{shadowOnly:true,affectsBuyNow:false,automaticPromotion:false,productionEnabled:false,requiredSample:required,criteria:'A pattern+state needs the minimum setup/state episodes, at least 55% positive forward outcomes, positive expectancy, and positive average market excess return before it is only flagged for human/model review.'}
  };
}

function normalizePatternRow(row){
  let payload={};try{payload=JSON.parse(row?.payloadJson||'{}');}catch{}
  const context=payload?.patternContext;if(!context||context.shadowOnly!==true)return null;
  const forwardReturn=nullable(row?.forwardReturn);if(forwardReturn==null)return null;
  const primary=context.primaryPattern||null;
  return{
    symbol:String(row?.symbol||'').toUpperCase(),observedAt:Number(row?.observedAt)||0,sessionDate:easternDateKey(Number(row?.observedAt)||0),
    forwardReturn,mfe:nullable(row?.mfe),mae:nullable(row?.mae),marketExcessReturn:nullable(row?.marketExcessReturn),sectorExcessReturn:nullable(row?.sectorExcessReturn),
    structureState:String(context.structureState||''),breakoutState:String(context.breakout?.state||'INSIDE'),channelType:String(context.channel?.type||'NO CLEAR CHANNEL'),
    primaryPattern:primary?String(primary.type||''):null,primaryFamily:primary?String(primary.family||''):null,primaryState:primary?String(primary.state||''):null,primaryBias:primary?String(primary.bias||''):null,primaryConfidence:primary?Number(primary.confidence)||0:0
  };
}

function dedupePatternRows(rows){
  const map=new Map();for(const row of rows){const key=`${row.symbol}|${row.primaryPattern}|${row.sessionDate}`,prior=map.get(key);if(!prior||row.primaryConfidence>prior.primaryConfidence||(row.primaryConfidence===prior.primaryConfidence&&row.observedAt>prior.observedAt))map.set(key,row);}return[...map.values()].sort(sortRows);
}
function dedupeStructureRows(rows){const map=new Map();for(const row of rows){const key=`${row.symbol}|${row.sessionDate}`,prior=map.get(key);if(!prior||row.observedAt>prior.observedAt)map.set(key,row);}return[...map.values()].sort(sortRows);}

export function buildPatternEpisodes(rows){return buildEpisodes(rows,{stateSensitive:false});}
export function buildPatternStateEpisodes(rows){return buildEpisodes(rows,{stateSensitive:true});}
function buildEpisodes(rows,{stateSensitive=false}={}){
  const bySymbol=new Map();for(const row of (rows||[]).slice().sort(sortRows)){if(!bySymbol.has(row.symbol))bySymbol.set(row.symbol,[]);bySymbol.get(row.symbol).push(row);}
  const episodes=[];
  for(const symbolRows of bySymbol.values()){
    let active=null;
    for(const row of symbolRows){
      const pattern=String(row.primaryPattern||''),state=String(row.primaryState||'UNKNOWN');
      if(!pattern){active=null;continue;}
      const key=stateSensitive?`${pattern}|${state}`:pattern,gap=active?calendarDays(active.lastSessionDate,row.sessionDate):Infinity,continues=Boolean(active&&active.key===key&&gap>=0&&gap<=7);
      if(!continues){episodes.push({...row,episodeStart:row.sessionDate,episodeEnd:row.sessionDate,episodeObservations:1});active={key,index:episodes.length-1,lastSessionDate:row.sessionDate};}
      else{const episode=episodes[active.index];episode.episodeEnd=row.sessionDate;episode.episodeObservations+=1;active.lastSessionDate=row.sessionDate;}
    }
  }
  return episodes.sort(sortRows);
}

function segment(rows,keyFn){const groups=new Map();for(const row of rows){const key=String(keyFn(row));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}return[...groups.entries()].map(([key,items])=>({key,...metrics(items)})).sort((a,b)=>b.sampleSize-a.sampleSize||a.key.localeCompare(b.key));}
function metrics(rows){const values=(rows||[]).map(row=>row.forwardReturn).filter(Number.isFinite),wins=values.filter(value=>value>0);return{sampleSize:values.length,winRate:rate(wins.length,values.length),expectancy:average(values),avgMfe:averageNullable((rows||[]).map(row=>row.mfe)),avgMae:averageNullable((rows||[]).map(row=>row.mae)),avgMarketExcessReturn:averageNullable((rows||[]).map(row=>row.marketExcessReturn)),avgSectorExcessReturn:averageNullable((rows||[]).map(row=>row.sectorExcessReturn)),marketBeatRate:rate((rows||[]).filter(row=>row.marketExcessReturn!=null&&row.marketExcessReturn>0).length,(rows||[]).filter(row=>row.marketExcessReturn!=null).length)};}
function candidateMetrics(item){return item.sampleSize>0&&item.winRate!=null&&item.winRate>=.55&&finite(item.expectancy)>0&&finite(item.avgMarketExcessReturn)>0;}
function confidenceBand(value){const n=Number(value)||0;return n>=80?'80-100':n>=65?'65-79':n>=50?'50-64':'<50';}
function easternDateKey(time){if(!(Number(time)>0))return'UNKNOWN';const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Number(time))).map(part=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}`;}
function calendarDays(a,b){const x=Date.parse(`${a}T00:00:00Z`),y=Date.parse(`${b}T00:00:00Z`);return Number.isFinite(x)&&Number.isFinite(y)?Math.round((y-x)/86_400_000):Infinity;}
function sortRows(a,b){return String(a.symbol||'').localeCompare(String(b.symbol||''))||Number(a.observedAt)-Number(b.observedAt);}
function average(values){const rows=(values||[]).filter(Number.isFinite);return rows.length?rows.reduce((sum,value)=>sum+value,0)/rows.length:null;}
function averageNullable(values){return average((values||[]).filter(value=>value!=null));}
function rate(numerator,denominator){return denominator?numerator/denominator:null;}
function nullable(value){const n=Number(value);return value!==null&&value!==undefined&&Number.isFinite(n)?n:null;}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:0;}
