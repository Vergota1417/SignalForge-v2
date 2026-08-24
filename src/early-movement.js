export function earlyMovementSignal(row={}){
  const velocity=finite(row.scoreVelocity),rvol=Math.max(0,finite(row.relativeVolume)),move=finite(row.changePct),score=finite(row.rollingDiscoveryScore??row.discoveryScore??row.score);
  const velocityPts=clamp(velocity*2.2,0,32),rvolPts=clamp((rvol-1)*24,0,28),movePts=move>0&&move<=6?clamp(move*5,0,22):move>6?Math.max(0,22-(move-6)*6):0,discoveryPts=clamp((score-20)*.35,0,18);
  const acceleration=Math.round(clamp(velocityPts+rvolPts+movePts+discoveryPts,0,100));
  const confirmations=[velocity>=4,rvol>=1.2,move>=.5&&move<=6,score>=30].filter(Boolean).length;
  let state='QUIET';
  if(acceleration>=72&&confirmations>=3)state='EARLY MOVEMENT — BUILDING';
  else if(acceleration>=50&&confirmations>=2)state='MOVEMENT WATCH';
  const reasons=[];
  if(velocity>=4)reasons.push(`discovery velocity +${round(velocity,1)}`);
  if(rvol>=1.2)reasons.push(`RVOL ${round(rvol,2)}x`);
  if(move>=.5&&move<=6)reasons.push(`price +${round(move,2)}%`);
  if(score>=30)reasons.push(`discovery ${Math.round(score)}`);
  return{state,acceleration,confirmations,velocity:round(velocity,1),relativeVolume:round(rvol,2),changePct:round(move,2),discoveryScore:round(score,1),reasons,action:state==='EARLY MOVEMENT — BUILDING'?'WATCH CLOSELY — wait for live BUY gates':state==='MOVEMENT WATCH'?'MONITOR — participation is improving':'NO EARLY ACTION'};
}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function round(v,d=1){const p=10**d;return Math.round(v*p)/p;}
