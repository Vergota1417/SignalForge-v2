import { getDiscoveryPool } from './discovery.js';

const HOT_RECHECK_MS=30*60*1000;
const ACTIVE_RECHECK_MS=90*60*1000;
const ANY_RECHECK_MS=15*60*1000;
const HOT_CAP=12;
const ACTIVE_CAP=48;

export async function getTieredScannerBatch(env,{limit=6,exploreCursor=0,now=Date.now()}={}){
  const pool=await getDiscoveryPool(env,{limit:120,now});
  if(!pool.length)return{symbols:[],tiers:{hot:0,active:0,explore:0},selected:{hot:[],active:[],explore:[]},nextExploreCursor:0,universeSize:0,cooldownCount:0};
  const rows=await env.DB.prepare(`SELECT symbol,last_scanned AS lastScanned,scan_count AS scanCount,rolling_score AS rollingScore,score_velocity AS scoreVelocity,dollar_volume AS dollarVolume,relative_volume AS relativeVolume,cooldown_until AS cooldownUntil FROM discovery_stats`).all();
  const stats=new Map((rows.results||[]).map(r=>[String(r.symbol||'').toUpperCase(),normalizeStat(r)]));
  const eligiblePool=pool.filter(symbol=>Number(stats.get(symbol)?.cooldownUntil||0)<=now),cooldownCount=pool.length-eligiblePool.length;
  if(!eligiblePool.length)return{symbols:[],tiers:{hot:0,active:0,explore:0},selected:{hot:[],active:[],explore:[]},nextExploreCursor:0,universeSize:pool.length,cooldownCount};
  const classified=classifyScannerUniverse(eligiblePool,stats,{now});
  const allocation=allocationForLimit(limit);
  const batch=selectTieredSymbols(classified,{limit,exploreCursor,now,allocation});
  return{...batch,tiers:{hot:classified.hot.length,active:classified.active.length,explore:classified.explore.length},universeSize:pool.length,cooldownCount};
}

export function classifyScannerUniverse(pool,stats,{now=Date.now()}={}){
  const rows=(pool||[]).map(symbol=>({symbol,...(stats.get(symbol)||emptyStat(symbol))})).filter(x=>Number(x.cooldownUntil||0)<=now);
  const hotEligible=rows.filter(isHot).sort(prioritySort).slice(0,HOT_CAP),hotSet=new Set(hotEligible.map(x=>x.symbol));
  const activeEligible=rows.filter(x=>!hotSet.has(x.symbol)&&isActive(x)).sort(prioritySort).slice(0,ACTIVE_CAP),activeSet=new Set(activeEligible.map(x=>x.symbol));
  const explore=rows.filter(x=>!hotSet.has(x.symbol)&&!activeSet.has(x.symbol)).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return{hot:hotEligible,active:activeEligible,explore};
}

export function selectTieredSymbols(classified,{limit=6,exploreCursor=0,now=Date.now(),allocation=allocationForLimit(limit)}={}){
  const cap=Math.max(1,Math.min(6,Number(limit)||6)),selected=[];
  const dueHot=(classified?.hot||[]).filter(x=>isDue(x,now,HOT_RECHECK_MS));
  const dueActive=(classified?.active||[]).filter(x=>isDue(x,now,ACTIVE_RECHECK_MS));
  take(selected,dueHot,Math.min(allocation.hot,cap),'HOT');
  take(selected,dueActive,Math.min(allocation.active,Math.max(0,cap-selected.length)),'ACTIVE');

  const explorePick=rotateExplore(classified?.explore||[],exploreCursor,Math.min(allocation.explore,Math.max(0,cap-selected.length)));
  for(const item of explorePick.items)selected.push({symbol:item.symbol,tier:'EXPLORE',lastScanned:item.lastScanned});

  if(selected.length<cap){
    const used=new Set(selected.map(x=>x.symbol));
    const fill=[...(classified?.hot||[]),...(classified?.active||[]),...(classified?.explore||[])]
      .filter(x=>!used.has(x.symbol)&&isDue(x,now,ANY_RECHECK_MS))
      .sort(oldestFirst);
    take(selected,fill,cap-selected.length,null);
  }

  const picked={hot:selected.filter(x=>x.tier==='HOT').map(x=>x.symbol),active:selected.filter(x=>x.tier==='ACTIVE').map(x=>x.symbol),explore:selected.filter(x=>x.tier==='EXPLORE').map(x=>x.symbol)};
  return{symbols:selected.map(x=>x.symbol),selected:picked,nextExploreCursor:explorePick.nextCursor};
}

export function allocationForLimit(limit=6){const cap=Math.max(1,Math.min(6,Number(limit)||6));if(cap>=6)return{hot:3,active:2,explore:1};if(cap===5)return{hot:2,active:2,explore:1};if(cap===4)return{hot:2,active:1,explore:1};if(cap===3)return{hot:1,active:1,explore:1};if(cap===2)return{hot:1,active:0,explore:1};return{hot:0,active:0,explore:1};}

function isHot(x){return x.scanCount>0&&x.dollarVolume>=2_000_000&&(x.rollingScore>=40||x.relativeVolume>=1.5||x.scoreVelocity>=8);}
function isActive(x){return x.scanCount>0&&(x.rollingScore>=12||x.relativeVolume>=1.1||x.dollarVolume>=10_000_000);}
function prioritySort(a,b){return oldestFirst(a,b)||b.rollingScore-a.rollingScore||b.scoreVelocity-a.scoreVelocity||b.relativeVolume-a.relativeVolume||a.symbol.localeCompare(b.symbol);}
function oldestFirst(a,b){return Number(a.lastScanned||0)-Number(b.lastScanned||0);}
function isDue(x,now,interval){return !x.lastScanned||now-Number(x.lastScanned)>=interval;}
function take(target,source,count,forcedTier){for(const item of source.slice(0,Math.max(0,count))){target.push({symbol:item.symbol,tier:forcedTier||scannerTier(item),lastScanned:item.lastScanned});}}
function scannerTier(x){if(isHot(x))return'HOT';if(isActive(x))return'ACTIVE';return'EXPLORE';}
function rotateExplore(rows,cursor,count){if(!rows.length||count<=0)return{items:[],nextCursor:0};const start=Math.max(0,Number(cursor)||0)%rows.length,items=[];for(let i=0;i<rows.length&&items.length<count;i++)items.push(rows[(start+i)%rows.length]);return{items,nextCursor:(start+items.length)%rows.length};}
function normalizeStat(r){return{symbol:String(r.symbol||'').toUpperCase(),lastScanned:Number(r.lastScanned)||0,scanCount:Number(r.scanCount)||0,rollingScore:Number(r.rollingScore)||0,scoreVelocity:Number(r.scoreVelocity)||0,dollarVolume:Number(r.dollarVolume)||0,relativeVolume:Number(r.relativeVolume)||0,cooldownUntil:Number(r.cooldownUntil)||0};}
function emptyStat(symbol){return{symbol,lastScanned:0,scanCount:0,rollingScore:0,scoreVelocity:0,dollarVolume:0,relativeVolume:0,cooldownUntil:0};}
