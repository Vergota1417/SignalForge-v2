const average = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

function sma(values, period) {
  if (values.length < period) return null;
  return average(values.slice(-period));
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (!losses) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function atr(candles, period = 14) {
  if (candles.length <= period) return 0;
  const trs = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return average(trs);
}

function rollingSma(values, index, period) {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += values[i];
  return sum / period;
}

function rollingRsi(values, index, period = 14) {
  if (index < period) return 50;
  let gains = 0, losses = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (!losses) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function walkForward(candles) {
  const closes = candles.map(c => c.close);
  const horizon = Math.max(3, Math.round(candles.length / 45));
  let total = 0, wins = 0;
  const returns = [];
  for (let i = 55; i < closes.length - horizon; i++) {
    const s20 = rollingSma(closes, i, 20), s50 = rollingSma(closes, i, 50);
    if (!s20 || !s50) continue;
    const momentum = closes[i] / closes[i - 10] - 1;
    const rsiValue = rollingRsi(closes, i, 14);
    const extension = closes[i] / s20 - 1;
    if (!(closes[i] > s50 && s20 > s50 && momentum > 0 && rsiValue < 72 && extension < .045)) continue;
    const ret = closes[i + horizon] / closes[i] - 1;
    total++;
    returns.push(ret);
    if (ret > 0) wins++;
  }
  return { sample: total, winRate: total ? wins / total : .5, avgReturn: returns.length ? average(returns) : 0 };
}

function engineState(name, metrics, needed) {
  const passes = metrics.filter(m => m.pass).length;
  const ready = passes >= needed;
  return { name, metrics, passes, total: metrics.length, ready, state: ready ? 'PASS' : passes >= needed - 1 ? 'WARN' : 'FAIL' };
}

function benchmarkState(candles) {
  if (!Array.isArray(candles) || candles.length < 50) return null;
  const closes = candles.map(c => c.close);
  const latest = closes.at(-1);
  const s20 = sma(closes, 20), s50 = sma(closes, 50);
  const momentum20 = closes.length > 20 ? latest / closes[closes.length - 21] - 1 : 0;
  return {
    symbol: 'SPY', latest, sma20:s20, sma50:s50, momentum20,
    bull:Boolean(s20 && s50 && latest > s50 && s20 > s50),
    riskOff:Boolean(s20 && s50 && latest < s50 && s20 < s50)
  };
}

export function assessIntradayConfirmation(candles) {
  if (!Array.isArray(candles) || candles.length < 30) {
    return { pass:false, passes:0, total:5, state:'INSUFFICIENT', timeframe:'15m', reason:'Not enough completed 15-minute candles.' };
  }

  // Twelve Data can include the currently-forming bar. Confirmation deliberately uses
  // the prior bar so partial volume/price cannot create a premature BUY signal.
  const completed = candles.slice(0, -1);
  const closes = completed.map(c => c.close);
  const latest = completed.at(-1);
  const s9 = sma(closes, 9) || latest.close;
  const s20 = sma(closes, 20) || latest.close;
  const r14 = rsi(closes, 14);
  const momentum4 = closes.length > 4 ? latest.close / closes[closes.length - 5] - 1 : 0;
  const priorVolumes = completed.slice(-21, -1).map(c => Number(c.volume || 0)).filter(v => v > 0);
  const baselineVolume = average(priorVolumes);
  const relativeVolume = baselineVolume > 0 ? Number(latest.volume || 0) / baselineVolume : 0;

  const metrics = [
    { name:'15m price trend', value:`Price ${latest.close > s20 ? 'above' : 'below'} 20-bar average`, pass:latest.close > s20 },
    { name:'15m trend alignment', value:`9-bar ${s9 > s20 ? 'above' : 'below'} 20-bar`, pass:s9 > s20 },
    { name:'1-hour momentum', value:`${(momentum4*100).toFixed(2)}%`, pass:momentum4 > 0 },
    { name:'15m RSI', value:r14.toFixed(1), pass:r14 >= 45 && r14 <= 70, warn:r14 > 70 && r14 < 76 },
    { name:'Completed-bar relative volume', value:`${relativeVolume.toFixed(2)}x`, pass:relativeVolume >= .80, warn:relativeVolume >= .60 }
  ];
  const passes = metrics.filter(m => m.pass).length;
  const pass = passes >= 4;
  return {
    pass, passes, total:metrics.length, state:pass ? 'PASS' : passes === 3 ? 'WARN' : 'FAIL', timeframe:'15m',
    latestTime:latest.time, latestPrice:latest.close, sma9:s9, sma20:s20, rsi:r14, momentum4, relativeVolume, metrics,
    reason:pass ? '15-minute trend, momentum, and participation confirm the higher-timeframe setup.' : '15-minute confirmation is not strong enough yet.'
  };
}

export function analyze(candles, symbol, context = {}) {
  const closes = candles.map(c => c.close);
  const latest = candles.at(-1), previous = candles.at(-2) || latest;
  const s20 = sma(closes, 20) || latest.close, s50 = sma(closes, 50) || s20;
  const a14 = atr(candles, 14) || latest.close * .02, r14 = rsi(closes, 14);
  const momentum20 = closes.length > 20 ? latest.close / closes[closes.length - 21] - 1 : 0;
  const recentMax = Math.max(...closes.slice(-20));
  const pullbackDepth = recentMax ? (recentMax - latest.close) / recentMax : 0;
  const extensionPct = (latest.close - s20) / s20, trendStrength = (s20 - s50) / s50;
  const benchmark = benchmarkState(context.benchmarkCandles);
  const relativeStrength20 = benchmark ? momentum20 - benchmark.momentum20 : null;
  const legacyRelativeStrengthProxy = momentum20 - average(closes.slice(-10).map((v, i, a) => i ? v / a[i - 1] - 1 : 0));
  const intradayConfirmation = context.intradayConfirmation || null;

  const preferredEntryLow = Math.max(.01, s20 - .40 * a14);
  const preferredEntryHigh = s20 + .18 * a14;
  const overextension = s20 + 1.45 * a14;
  const thesisBreak = Math.max(.01, s50 - 1.05 * a14);
  const target = Math.max(recentMax + .75 * a14, latest.close + 1.85 * a14);
  const risk = Math.max(.01, latest.close - thesisBreak), reward = Math.max(0, target - latest.close), rr = reward / risk;
  const wf = walkForward(candles);

  const trendMetrics = [
    { name:'50-period trend', value:`Price ${latest.close >= s50 ? 'above' : 'below'} 50-period trend`, pass:latest.close > s50 },
    { name:'Trend alignment', value:`20-period ${s20 >= s50 ? 'above' : 'below'} 50-period`, pass:s20 > s50 },
    { name:'Momentum', value:`${(momentum20*100).toFixed(1)}% over lookback`, pass:momentum20 > 0 },
    benchmark
      ? { name:'Relative strength vs SPY', value:`${relativeStrength20 >= 0 ? '+' : ''}${(relativeStrength20*100).toFixed(1)}% vs SPY`, pass:relativeStrength20 > 0 }
      : { name:'Relative strength proxy', value:legacyRelativeStrengthProxy >= 0 ? 'Positive' : 'Lagging', pass:legacyRelativeStrengthProxy >= -.0015, warn:true }
  ];
  const entryMetrics = [
    { name:'Extension vs 20', value:`${(extensionPct*100).toFixed(1)}%`, pass:latest.close <= overextension, warn:latest.close > preferredEntryHigh },
    { name:'Pullback depth', value:`${(pullbackDepth*100).toFixed(1)}%`, pass:pullbackDepth >= .008 && pullbackDepth <= .08, warn:pullbackDepth < .008 },
    { name:'RSI (14)', value:r14.toFixed(1), pass:r14 >= 42 && r14 <= 69, warn:r14 > 69 && r14 < 76 },
    { name:'Entry zone', value: latest.close >= preferredEntryLow && latest.close <= preferredEntryHigh ? 'Inside preferred zone' : latest.close > preferredEntryHigh ? 'Above preferred zone' : 'Below preferred zone', pass:latest.close >= preferredEntryLow && latest.close <= preferredEntryHigh, warn:latest.close > preferredEntryHigh }
  ];
  const regimePass = benchmark ? !benchmark.riskOff : trendStrength > 0;
  const regimeValue = benchmark ? (benchmark.bull ? 'SPY bull trend' : benchmark.riskOff ? 'SPY risk-off' : 'SPY mixed/neutral') : (trendStrength > .005 ? 'Bull trend' : trendStrength > -.005 ? 'Neutral' : 'Bearish');
  const probabilityMetrics = [
    { name:'Walk-forward win rate', value:`${(wf.winRate*100).toFixed(0)}% (${wf.sample} samples)`, pass:wf.sample >= 5 && wf.winRate >= .57, warn:wf.sample < 5 || (wf.winRate >= .52 && wf.winRate < .57) },
    { name:'Forward expectancy', value:`${(wf.avgReturn*100).toFixed(2)}% avg`, pass:wf.sample >= 5 && wf.avgReturn > 0, warn:wf.sample < 5 },
    { name:'Pattern sample quality', value:wf.sample >= 12 ? 'Good' : wf.sample >= 5 ? 'Limited' : 'Insufficient', pass:wf.sample >= 12, warn:wf.sample >= 5 },
    { name:'Market regime', value:regimeValue, pass:regimePass, warn:benchmark ? !benchmark.bull : trendStrength > -.005 }
  ];
  const rrMetrics = [
    { name:'Stop distance', value:`${(risk/latest.close*100).toFixed(1)}%`, pass:risk/latest.close <= .08, warn:risk/latest.close <= .12 },
    { name:'Expected target', value:`${(reward/latest.close*100).toFixed(1)}%`, pass:reward/latest.close >= .06, warn:reward/latest.close >= .035 },
    { name:'Reward / risk', value:`${rr.toFixed(2)} : 1`, pass:rr >= 1.8, warn:rr >= 1.25 },
    { name:'Price vs thesis break', value:latest.close > thesisBreak ? 'Thesis intact' : 'Broken', pass:latest.close > thesisBreak }
  ];

  const engines = {
    trend:engineState('TREND', trendMetrics, 3), entry:engineState('ENTRY', entryMetrics, 3),
    probability:engineState('PROBABILITY', probabilityMetrics, 3), riskReward:engineState('RISK / REWARD', rrMetrics, 3)
  };
  const allMetrics = [...trendMetrics, ...entryMetrics, ...probabilityMetrics, ...rrMetrics];
  const passed = allMetrics.filter(m => m.pass).length, total = allMetrics.length;
  const criticalFailed = Object.values(engines).filter(e => !e.ready).map(e => e.name);
  const nearEntry = latest.close >= preferredEntryLow*.99 && latest.close <= preferredEntryHigh*1.02;
  const dailyGatesReady = engines.trend.ready && engines.entry.ready && engines.probability.ready && engines.riskReward.ready;

  let status, reason;
  if (latest.close <= thesisBreak) { status='SELL / EXIT'; reason='Price broke the thesis level. The original setup is invalid until a new base forms.'; }
  else if (!engines.trend.ready) { status='AVOID'; reason='Trend quality is not strong enough to justify an entry setup.'; }
  else if (benchmark?.riskOff && !engines.probability.ready) { status='WAIT — SETUP NOT READY'; reason='The stock setup is improving, but the broad-market regime is currently risk-off.'; }
  else if (latest.close > overextension || r14 >= 76) { status='WAIT FOR PULLBACK'; reason='Trend is strong, but price is too extended to chase at the current level.'; }
  else if (dailyGatesReady && intradayConfirmation?.pass) { status='BUY NOW'; reason='All four higher-timeframe gates cleared and the 15-minute confirmation also passed.'; }
  else if (dailyGatesReady) { status='SETUP — READY SOON'; reason=intradayConfirmation ? 'All higher-timeframe gates cleared, but 15-minute confirmation is not strong enough yet.' : 'All higher-timeframe gates cleared; waiting for selective 15-minute confirmation before BUY NOW.'; }
  else if (engines.trend.ready && nearEntry && (engines.probability.ready || engines.riskReward.ready)) { status='SETUP — READY SOON'; reason='Price is near the preferred entry zone, but one critical higher-timeframe gate is still missing.'; }
  else { status='WAIT — SETUP NOT READY'; reason='Several checks pass, but at least one critical gate is still blocking a BUY signal.'; }

  let readiness = Math.round((passed/total)*55 + ((4-criticalFailed.length)/4)*45);
  if (dailyGatesReady && intradayConfirmation?.pass) readiness=Math.max(readiness,92);
  else if (dailyGatesReady) readiness=Math.max(readiness,82);
  if (status==='AVOID' || status==='SELL / EXIT') readiness=Math.min(readiness,35);
  if (status==='WAIT FOR PULLBACK') readiness=Math.min(readiness,68);

  return { symbol, latest, changePct:previous.close ? latest.close/previous.close-1 : 0, sma20:s20, sma50:s50, atr:a14, rsi:r14, momentum20,
    relativeStrength20, benchmark, intradayConfirmation, dailyGatesReady, preferredEntryLow, preferredEntryHigh, overextension, thesisBreak, target, rr, wf,
    engines, passed, total, criticalFailed, status, reason, readiness };
}
