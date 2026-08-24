import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessSessionRange, SESSION_RANGE_SHADOW_VERSION } from '../src/session-range.js';
import { refreshExecutionAnalysis } from '../src/execution-confirmation.js';

function makeSession(day,rangePct){
  const start=Date.UTC(2026,7,17+day,13,30),bars=[];
  for(let i=0;i<26;i++){
    const frac=(i+1)/26,half=100*rangePct*frac/2,open=100,close=100+half*.8;
    bars.push({time:start+i*15*60*1000,open,high:100+half,low:100-half,close,volume:100000+i*1000});
  }
  return bars;
}
function feed(currentRangePct){return[...makeSession(0,.020),...makeSession(1,.022),...makeSession(2,.018),...makeSession(3,.021),...makeSession(4,currentRangePct)];}
function engine(){return{ready:true,passes:4,total:4,metrics:[]};}
function base(){return{symbol:'TEST',latest:{close:100},changePct:.01,rsi:58,atr:2.5,target:110,thesisBreak:95,overextension:108,preferredEntryLow:97,preferredEntryHigh:103,readiness:86,dailyGatesReady:true,status:'SETUP — READY SOON',reason:'Waiting for execution.',engines:{trend:engine(),entry:engine(),probability:engine(),riskReward:engine()}};}
function confirmation(price=100){return{pass:true,participationPass:true,passes:5,total:5,state:'PASS',latestPrice:price,latestTime:Date.now(),relativeVolume:1.4,momentum4:.01,reason:'Participation confirmed.'};}

const good=assessSessionRange(feed(.010),{atr:2.5,currentPrice:100.48});
assert.equal(good.version,SESSION_RANGE_SHADOW_VERSION);
assert.equal(good.shadowOnly,true);
assert.equal(good.affectsBuyNow,false);
assert.equal(good.state,'GOOD','A low-usage session should be labeled GOOD in shadow mode.');
assert.ok(good.atrUsage<.65);
assert.ok(good.medianRangeUsage<.75);

const stretched=assessSessionRange(feed(.024),{atr:2.0,currentPrice:101.15});
assert.equal(stretched.state,'STRETCHED','A near-high session beyond normal range should be labeled STRETCHED.');
assert.ok(stretched.atrUsage>=.90);
assert.ok(stretched.rangePosition>=.80);

const buy=refreshExecutionAnalysis(base(),confirmation(100));
assert.equal(buy.status,'BUY NOW');
const buyWithShadow={...buy,sessionRangeShadow:stretched};
assert.equal(buyWithShadow.status,'BUY NOW','A STRETCHED shadow label must not change production BUY NOW while shadow-only.');
assert.equal(buyWithShadow.sessionRangeShadow.affectsBuyNow,false);

const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');
assert.match(screener,/assessSessionRange\(intraday\.candles/,'Execution scans must derive room-to-run from the already loaded 15m candles.');
assert.match(screener,/recordSessionRangeShadow/,'Every calculated room-to-run shadow should be stored for validation.');
assert.doesNotMatch(screener,/session-range[^\n]*getMarketData/,'Room-to-run must not introduce its own provider request.');
const ui=fs.readFileSync(new URL('../public/session-range-ui.js',import.meta.url),'utf8');
assert.match(ui,/\/api\/signals/,'Phone room-to-run display must read saved D1 signal state rather than market-data provider calls.');
assert.match(ui,/does not block or create BUY NOW/,'UI must clearly identify the feature as shadow-only.');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert.match(index,/session-range-ui\.js/,'Dashboard must load the room-to-run UI.');

console.log('Stage 14.13 session range shadow regression checks passed.');
