function pct(v){return Number.isFinite(Number(v))?Number(v):0;}

export function evaluateStrategy(analysis, holding=null) {
  if (!analysis?.latest?.close) return null;
  const price=Number(analysis.latest.close);
  const rr=Number(analysis.rr)||0;
  const trendReady=Boolean(analysis.engines?.trend?.ready);
  const probabilityReady=Boolean(analysis.engines?.probability?.ready);
  const riskRewardReady=Boolean(analysis.engines?.riskReward?.ready);
  const entryReady=Boolean(analysis.engines?.entry?.ready);
  const overextended=price>Number(analysis.overextension||Infinity) || Number(analysis.rsi||0)>=76;
  const nearEntry=price>=Number(analysis.preferredEntryLow||0)*.99 && price<=Number(analysis.preferredEntryHigh||Infinity)*1.03;
  const thesisBroken=price<=Number(analysis.thesisBreak||0);
  const owned=Boolean(holding && Number(holding.shares)>0 && Number(holding.entryPrice)>0);

  if (owned) {
    const entryPrice=Number(holding.entryPrice);
    const shares=Number(holding.shares);
    const gainPct=entryPrice>0?price/entryPrice-1:0;
    const marketValue=price*shares;
    const costBasis=entryPrice*shares;
    let state='HOLD', reason='The investment thesis remains intact. Continue monitoring the larger trend and risk level.';

    if (thesisBroken || analysis.status==='SELL / EXIT') {
      state='SELL / EXIT';
      reason='Price has broken the thesis level. The original reason for owning this position is no longer intact.';
    } else if ((!trendReady && gainPct<=0) || (analysis.benchmark?.riskOff && !probabilityReady && gainPct<.03)) {
      state='SELL / EXIT';
      reason='Trend and market evidence deteriorated while the position has little or no profit cushion.';
    } else if (gainPct>=.10 && (overextended || !entryReady || Number(analysis.rsi||0)>=72)) {
      state='PROTECT PROFIT';
      reason='The position is profitable but price is extended or momentum is cooling. Protect gains while the thesis remains valid.';
    } else if (gainPct>=.18 && !probabilityReady) {
      state='PROTECT PROFIT';
      reason='A meaningful gain is open while continuation evidence has weakened. Protect the profit rather than assuming the trend will continue.';
    }

    return {
      mode:'HOLDING', state, reason, price, entryPrice, shares, gainPct,
      gainAmount:marketValue-costBasis, marketValue, costBasis,
      thesisBreak:Number(analysis.thesisBreak)||null,
      opportunityScore:opportunityScore(analysis),
      timingEvidence:timingEvidence(analysis)
    };
  }

  let state='WATCH', reason='The stock is worth monitoring, but the larger setup is not strong enough to commit capital yet.';
  if (thesisBroken || analysis.status==='SELL / EXIT' || analysis.status==='AVOID' || !trendReady) {
    state='AVOID';
    reason='The larger trend or thesis quality is not strong enough for a new investment.';
  } else if (overextended) {
    state='WATCH';
    reason='The larger setup may be attractive, but price is extended. Do not chase the move.';
  } else if (analysis.dailyGatesReady && rr>=1.5 && nearEntry) {
    state='BUY WINDOW';
    reason='The larger setup, probability, and risk/reward are favorable and price is in a reasonable entry area. Intraday data is supporting timing evidence, not the investment thesis.';
  } else if (trendReady && probabilityReady && riskRewardReady && rr>=1.35) {
    state='BUY CANDIDATE';
    reason='The stock has favorable higher-timeframe evidence and asymmetric potential, but the current entry is not attractive enough yet.';
  } else if (trendReady && (probabilityReady || riskRewardReady)) {
    state='WATCH';
    reason='The trend is constructive, but probability, entry quality, or reward/risk still needs improvement.';
  }

  return {
    mode:'CANDIDATE', state, reason, price, opportunityScore:opportunityScore(analysis),
    expectedUpside:price>0?Math.max(0,(Number(analysis.target)||price)-price)/price:0,
    thesisRisk:price>0?Math.max(0,price-Number(analysis.thesisBreak||price))/price:0,
    rr, timingEvidence:timingEvidence(analysis)
  };
}

export function rankOpportunities(signals, holdings=[]) {
  const owned=new Map((holdings||[]).map(h=>[h.symbol,h]));
  return (signals||[])
    .filter(row=>row?.analysis)
    .map(row=>({symbol:row.symbol,updatedAt:Number(row.updatedAt)||0,strategy:evaluateStrategy(row.analysis,owned.get(row.symbol)||null),analysis:row.analysis}))
    .filter(row=>row.strategy)
    .sort((a,b)=>{
      const order={'BUY WINDOW':5,'BUY CANDIDATE':4,'HOLD':3,'PROTECT PROFIT':2,'WATCH':1,'SELL / EXIT':0,'AVOID':0};
      const stateDelta=(order[b.strategy.state]||0)-(order[a.strategy.state]||0);
      if(stateDelta) return stateDelta;
      return pct(b.strategy.opportunityScore)-pct(a.strategy.opportunityScore);
    });
}

function opportunityScore(a) {
  const trend=a.engines?.trend?.ready?24:0;
  const probability=a.engines?.probability?.ready?24:0;
  const riskReward=a.engines?.riskReward?.ready?22:0;
  const entry=a.engines?.entry?.ready?14:0;
  const rs=Math.max(-.10,Math.min(.10,Number(a.relativeStrength20)||0))*60;
  const rr=Math.min(Math.max(Number(a.rr)||0,0),3)*4;
  const regime=a.benchmark?.riskOff?-10:a.benchmark?.bull?6:0;
  return Math.max(0,Math.min(100,Math.round(trend+probability+riskReward+entry+rs+rr+regime)));
}

function timingEvidence(a) {
  const c=a.intradayConfirmation;
  if(!c) return {state:'NOT CHECKED',pass:null,reason:'Intraday timing has not been checked. It does not determine the higher-timeframe investment thesis.'};
  return {state:c.state||'UNKNOWN',pass:Boolean(c.pass),reason:c.reason||''};
}
