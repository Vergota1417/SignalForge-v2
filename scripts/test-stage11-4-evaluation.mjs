import assert from 'node:assert/strict';
import { evaluateEvidenceRows } from '../src/evaluation.js';

const rows=[
 row('BUY NOW',.10,.08,.05,{readiness:90,rv:1.8,sector:'XLK'}),
 row('BUY NOW',-.04,-.03,-.02,{readiness:85,rv:1.6,sector:'XLK'}),
 row('WAIT — SETUP NOT READY',.08,.07,.06,{readiness:55,rv:.9,sector:'XLY'}),
 row('AVOID',.06,.05,.04,{readiness:30,rv:.8,sector:'XLY'}),
 row('AVOID',-.05,-.04,-.03,{readiness:25,rv:.7,sector:'XLE'})
];
const report=evaluateEvidenceRows(rows,{horizon:10,minSample:3});
assert.equal(report.sampleSize,5);
assert.equal(report.overall.winRate,3/5);
assert.ok(Math.abs(report.overall.expectancy-.03)<1e-12);
assert.equal(report.classification.falsePositives,1);
assert.equal(report.classification.falseNegatives,1);
assert.equal(report.classification.missedWinners,2);
assert.ok(report.overall.profitFactor>1);
assert.ok(report.overall.maxDrawdown<0);
assert.ok(report.segments.sector.some(x=>x.key==='XLK'&&x.sampleSize===2));
assert.equal(report.qualifiedSegments.sector.some(x=>x.key==='XLK'),false);
assert.equal(report.calibration.eligible,false);
assert.equal(report.calibration.buySampleSize,2);
assert.match(report.calibration.reason,/Need 1 more resolved BUY episode/);
const qualified=evaluateEvidenceRows([...rows,row('BUY NOW',.03,.02,.01,{readiness:82,rv:1.7,sector:'XLK'})],{horizon:10,minSample:3});
assert.equal(qualified.calibration.eligible,true);
assert.equal(qualified.calibration.bestQualifiedModel.modelVersion,'sf-analysis-v1');
assert.equal(qualified.calibration.bestQualifiedModel.sampleSize,6);
console.log('Stage 11.4 evidence evaluation checks passed');

function row(status,forwardReturn,marketExcessReturn,sectorExcessReturn,{readiness,rv,sector}){return{status,readiness,relativeVolume:rv,gatesReady:status==='BUY NOW'?4:2,gateTotal:4,modelVersion:'sf-analysis-v1',benchmarkRiskOff:0,forwardReturn,mfe:Math.max(forwardReturn,.12),mae:Math.min(forwardReturn,-.03),marketExcessReturn,sectorExcessReturn,payloadJson:JSON.stringify({benchmarkContext:{sectorBenchmark:sector}})};}
