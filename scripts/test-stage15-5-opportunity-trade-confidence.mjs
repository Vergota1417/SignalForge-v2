import assert from 'node:assert/strict';
import { buildScreenerRows, normalizeProbabilityPercent, opportunityScoreFor, tradeConfidenceFor } from '../src/screener.js';

const hotOpportunity=opportunityScoreFor({discoveryScore:70,scoreVelocity:10,relativeVolume:2.2,dollarVolume:50_000_000,changePct:4});
assert.ok(hotOpportunity>=80&&hotOpportunity<=100,'strong discovery conditions should produce a high Opportunity Score');
assert.equal(tradeConfidenceFor(null),null,'Trade Confidence must not exist before deep analysis');
assert.equal(normalizeProbabilityPercent(.64),64,'fraction probabilities must normalize to percent units');
assert.equal(normalizeProbabilityPercent(64),64,'percent probabilities must remain percent units');
assert.equal(normalizeProbabilityPercent(150),null,'invalid probability values must be ignored rather than clamped into false confidence');

const buyLike={readiness:92,dailyGatesReady:true,calibratedProbability:.64,status:'BUY NOW',engines:{trend:{ready:true},entry:{ready:true},context:{ready:true},validation:{ready:true}},intradayConfirmation:{pass:true,participationPass:true},hardBuyGuardrails:{pass:true}};
const buyConfidence=tradeConfidenceFor(buyLike);
assert.ok(buyConfidence>=80&&buyConfidence<=100,'deep analysis with all production gates cleared should produce strong Trade Confidence');
assert.equal(tradeConfidenceFor({...buyLike,calibratedProbability:64}),buyConfidence,'fraction and percent representations of the same probability must produce identical Trade Confidence');

const avoidConfidence=tradeConfidenceFor({...buyLike,status:'AVOID'});
assert.ok(avoidConfidence<=35,'AVOID must cap user-facing Trade Confidence');

const quotes=[{symbol:'TEST',name:'Test Co',price:25,changePct:4,relativeVolume:2,dollarVolume:20_000_000,volume:800_000,rollingDiscoveryScore:65,scoreVelocity:9}];
const discoveryOnly=buildScreenerRows(quotes,[])[0];
assert.ok(discoveryOnly.opportunityScore>0,'discovery rows must expose Opportunity Score');
assert.equal(discoveryOnly.tradeConfidence,null,'discovery-only rows must not fake Trade Confidence');
assert.equal(discoveryOnly.deepAnalysis,false);

const analyzed=buildScreenerRows(quotes,[{symbol:'TEST',status:'BUY NOW',analysis:buyLike,updatedAt:Date.now()}])[0];
assert.ok(analyzed.tradeConfidence>=80,'deep analyzed rows must expose Trade Confidence');
assert.equal(analyzed.opportunityScore,discoveryOnly.opportunityScore,'Opportunity Score must remain discovery-derived and independent of deep trade state');

console.log('Stage 15.5 Opportunity Score / Trade Confidence separation checks passed.');
