import assert from 'node:assert/strict';
import { evaluateStrategy } from '../src/strategy.js';

function analysis(overrides={}){
  const base={
    symbol:'TEST',latest:{close:100},rsi:58,rr:2.0,target:118,thesisBreak:94,overextension:109,preferredEntryLow:97,preferredEntryHigh:102,
    relativeStrength20:.03,dailyGatesReady:true,status:'SETUP — READY SOON',benchmark:{bull:true,riskOff:false},
    engines:{trend:{ready:true},entry:{ready:true},probability:{ready:true},riskReward:{ready:true}},intradayConfirmation:null
  };
  return {...base,...overrides,engines:{...base.engines,...(overrides.engines||{})}};
}

assert.equal(evaluateStrategy(analysis(),null).state,'BUY WINDOW','Strong higher-timeframe setup near entry should open a buy window without requiring intraday confirmation.');
assert.equal(evaluateStrategy(analysis({latest:{close:112}}),null).state,'WATCH','Overextended candidate must not be a buy window.');
assert.equal(evaluateStrategy(analysis({dailyGatesReady:false,engines:{entry:{ready:false}}}),null).state,'BUY CANDIDATE','Strong asymmetric setup with a poor current entry should remain a candidate.');
assert.equal(evaluateStrategy(analysis({latest:{close:93},status:'SELL / EXIT'}),{entryPrice:100,shares:2}).state,'SELL / EXIT','Owned position with a broken thesis must exit.');
assert.equal(evaluateStrategy(analysis({latest:{close:112},rsi:74}),{entryPrice:100,shares:2}).state,'PROTECT PROFIT','Profitable extended position should protect gains.');
assert.equal(evaluateStrategy(analysis({latest:{close:106}}),{entryPrice:100,shares:2}).state,'HOLD','Profitable position with intact thesis should hold.');

console.log('strategy regression tests passed');
