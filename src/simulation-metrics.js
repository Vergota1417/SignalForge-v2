export function aggregateTradeMetrics(rows=[]){
  const trades=(rows||[]).map(normalizeTrade),wins=trades.filter(x=>x.pnl>0),losses=trades.filter(x=>x.pnl<=0),grossWins=wins.reduce((s,x)=>s+x.pnl,0),grossLoss=Math.abs(losses.reduce((s,x)=>s+x.pnl,0)),realizedPnl=trades.reduce((s,x)=>s+x.pnl,0);
  return{totalTrades:trades.length,wins:wins.length,losses:losses.length,winRate:trades.length?wins.length/trades.length:0,realizedPnl,profitFactor:grossLoss>0?grossWins/grossLoss:(grossWins>0?null:0),avgTradeReturn:trades.length?trades.reduce((s,x)=>s+x.pnlPct,0)/trades.length:0};
}

export function modelCohortMetrics(rows=[]){
  const groups=new Map();
  for(const row of rows||[]){const key=String(row.modelVersion||'LEGACY/UNKNOWN');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return[...groups.entries()].map(([modelVersion,trades])=>({modelVersion,...aggregateTradeMetrics(trades)})).sort((a,b)=>b.totalTrades-a.totalTrades||a.modelVersion.localeCompare(b.modelVersion));
}

export function downsampleEquityCurve(rows=[],maxPoints=1200){
  const clean=(rows||[]).map(x=>({equity:Number(x.equity)||0,createdAt:Number(x.createdAt)||0})).filter(x=>x.createdAt>0).sort((a,b)=>a.createdAt-b.createdAt);
  const cap=Math.max(50,Number(maxPoints)||1200);if(clean.length<=cap)return clean;
  const result=[clean[0]],interior=cap-2,step=(clean.length-2)/interior;
  for(let i=0;i<interior;i++){const start=1+Math.floor(i*step),end=Math.min(clean.length-1,1+Math.floor((i+1)*step));if(end<=start){result.push(clean[start]);continue;}let chosen=clean[start],maxMove=-1;const baseline=result.at(-1)?.equity??chosen.equity;for(let j=start;j<end;j++){const move=Math.abs(clean[j].equity-baseline);if(move>maxMove){maxMove=move;chosen=clean[j];}}result.push(chosen);}
  result.push(clean.at(-1));return dedupe(result).slice(0,cap);
}

export function curveDrawdown(rows=[]){let peak=0,worst=0;for(const row of rows||[]){const equity=Number(row.equity)||0;peak=Math.max(peak,equity);if(peak>0)worst=Math.min(worst,equity/peak-1);}return worst;}

export function benchmarkPerformance({strategyReturn=0,benchmarkReturn=null}={}){const s=finite(strategyReturn),b=nullable(benchmarkReturn);return{strategyReturn:s,benchmarkReturn:b,excessReturn:b==null?null:s-b};}

function normalizeTrade(row){return{...row,pnl:finite(row?.pnl),pnlPct:finite(row?.pnlPct),modelVersion:String(row?.modelVersion||'LEGACY/UNKNOWN')};}
function dedupe(rows){const seen=new Set();return rows.filter(x=>{const key=`${x.createdAt}:${x.equity}`;if(seen.has(key))return false;seen.add(key);return true;});}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}function nullable(v){const n=Number(v);return v!==null&&v!==undefined&&Number.isFinite(n)?n:null;}
