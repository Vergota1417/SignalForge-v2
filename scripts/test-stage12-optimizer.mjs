import assert from 'node:assert/strict';
import { analyzeDecisionErrors, buildSetupLeaderboard, compareGateValue } from '../src/strategy-optimizer.js';
import { buildChallengerRule, compareChampionChallenger } from '../src/challenger.js';

const rows=[];
for(let i=0;i<40;i++)rows.push(row({status:'BUY NOW',readiness:72,rvol:1.15,gatesReady:4,sector:.01,ret:i%2?.02:-.015,market:i%2?.01:-.02,mae:i%2?-.008:-.025}));
for(let i=0;i<35;i++)rows.push(row({status:'BUY NOW',readiness:88,rvol:1.8,gatesReady:4,sector:.04,ret:i%5===0?-.01:.045,market:i%5===0?-.015:.03,mae:i%5===0?-.018:-.006}));
for(let i=0;i<30;i++)rows.push(row({status:'WAIT — SETUP NOT READY',readiness:55,rvol:.9,gatesReady:3,sector:-.02,ret:i%3===0?.08:-.01,market:i%3===0?.07:-.015,mae:-.02,failedGate:'momentum'}));

const board=buildSetupLeaderboard(rows,{minSample:20});assert.ok(board.some(x=>x.qualified));assert.ok(board[0].sampleSize>=20);
const errors=analyzeDecisionErrors(rows,{winnerThreshold:.05});assert.ok(errors.counts.falsePositives>0);assert.ok(errors.counts.missedWinners>0);
const gates=compareGateValue(rows);assert.ok(gates.some(x=>x.gate==='momentum'));
const goodRule=buildChallengerRule({statuses:['BUY NOW'],minReadiness:80,minRvol:1.5,minGates:4,requireStrongSector:true});const good=compareChampionChallenger(rows,goodRule,{minSample:30});assert.equal(good.checks.sample,true);assert.equal(good.checks.expectancy,true);assert.equal(good.checks.marketExcess,true);assert.equal(good.checks.falsePositiveRate,true);assert.equal(good.promotable,true);
const badRule=buildChallengerRule({statuses:['WAIT — SETUP NOT READY'],minReadiness:40});const bad=compareChampionChallenger(rows,badRule,{minSample:20});assert.equal(bad.checks.sample,true);assert.equal(bad.promotable,false);assert.equal(bad.decision,'KEEP_CHAMPION');
console.log('Stage 12 optimizer/challenger regression checks passed.');

function row({status,readiness,rvol,gatesReady,sector,ret,market,mae,failedGate=null}){const gates={trend:true,momentum:failedGate!=='momentum',participation:rvol>=1,structure:gatesReady>=4};return{status,readiness,relativeVolume:rvol,gatesReady,gateTotal:4,benchmarkRiskOff:0,forwardReturn:ret,marketExcessReturn:market,sectorExcessReturn:market-.005,mae,payloadJson:JSON.stringify({benchmarkContext:{sectorRelativeStrength20:sector,marketRelativeStrength20:.02},gates})};}
