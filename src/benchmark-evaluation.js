export function evaluateSectorRotationCohorts(rows=[],{minSample=20}={}){
  const usable=(rows||[]).map(normalize).filter(x=>x.forwardReturn!=null&&x.sectorRelativeStrength!=null);
  const strong=usable.filter(x=>x.sectorRelativeStrength>0),weak=usable.filter(x=>x.sectorRelativeStrength<=0);
  const strongStats=stats(strong),weakStats=stats(weak),sampleFloor=Math.max(5,Number(minSample)||20);
  const sufficient=strongStats.sample>=sampleFloor&&weakStats.sample>=sampleFloor;
  return{strongSector:strongStats,weakSector:weakStats,sufficientEvidence:sufficient,forwardReturnLift:sufficient?strongStats.avgForwardReturn-weakStats.avgForwardReturn:null,marketExcessLift:sufficient&&strongStats.avgMarketExcessReturn!=null&&weakStats.avgMarketExcessReturn!=null?strongStats.avgMarketExcessReturn-weakStats.avgMarketExcessReturn:null,recommendCriticalGate:false,reason:sufficient?'Evidence is measurable, but Stage 11.3 remains evidence-only; gate promotion requires later model evaluation.':`Need at least ${sampleFloor} observations in both positive and non-positive sector-relative-strength cohorts.`};
}
function normalize(row){const context=row?.benchmarkContext||row?.payload?.benchmarkContext||{};return{sectorRelativeStrength:finiteOrNull(row?.sectorRelativeStrength??context.sectorRelativeStrength),forwardReturn:finiteOrNull(row?.forwardReturn),marketExcessReturn:finiteOrNull(row?.marketExcessReturn)};}
function stats(rows){const forward=rows.map(x=>x.forwardReturn).filter(x=>x!=null),excess=rows.map(x=>x.marketExcessReturn).filter(x=>x!=null);return{sample:rows.length,winRate:forward.length?forward.filter(x=>x>0).length/forward.length:null,avgForwardReturn:avg(forward),avgMarketExcessReturn:avg(excess)};}
function avg(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}function finiteOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
