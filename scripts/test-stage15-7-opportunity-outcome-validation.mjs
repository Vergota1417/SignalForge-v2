import assert from 'node:assert/strict';
import fs from 'node:fs';
import { opportunityScoreFor } from '../src/screener.js';
import { buildOpportunityEpisodes, isOpportunityValidationSlot, OPPORTUNITY_EPISODE_GAP_MS, OPPORTUNITY_REVIEW_MIN_SAMPLE, summarizeOpportunityValidation } from '../src/opportunity-validation.js';

const strong={discoveryScore:65,scoreVelocity:10,relativeVolume:2,dollarVolume:100_000_000,changePct:2};
const weak={discoveryScore:0,scoreVelocity:0,relativeVolume:1,dollarVolume:2_000_000,changePct:0};
assert.ok(opportunityScoreFor(strong)>=80,'synthetic strong discovery must land in the high Opportunity Score cohort');
assert.ok(opportunityScoreFor(weak)<50,'synthetic weak discovery must reset an opportunity episode');

const base=Date.UTC(2026,7,24,14,0,0);
const observations=[
  row(1,'AAA',base,strong,{5:outcome(.04,.03)}),
  row(2,'AAA',base+15*60_000,strong,{5:outcome(.05,.04)}),
  row(3,'AAA',base+30*60_000,weak,{}),
  row(4,'AAA',base+45*60_000,strong,{5:outcome(.03,.02)}),
  row(5,'AAA',base+45*60_000+OPPORTUNITY_EPISODE_GAP_MS+1,strong,{5:outcome(.02,.01)}),
  row(6,'BBB',base,strong,{5:outcome(.01,.005)})
];
const episodes=buildOpportunityEpisodes(observations);
assert.deepEqual(episodes.filter(x=>x.symbol==='AAA').map(x=>x.id),[1,4,5],'repeated 15-minute high scores must remain one episode until reset or a long observation gap');
assert.equal(episodes.filter(x=>x.symbol==='BBB').length,1,'independent symbols must retain independent opportunity episodes');

const validatedEpisodes=[];
for(let i=0;i<OPPORTUNITY_REVIEW_MIN_SAMPLE;i++)validatedEpisodes.push({id:100+i,symbol:`H${i}`,observedAt:base+i,opportunityScore:85,outcomes:{5:outcome(.03,.02,.05,-.015)}});
for(let i=0;i<10;i++)validatedEpisodes.push({id:300+i,symbol:`L${i}`,observedAt:base+i,opportunityScore:70,outcomes:{5:outcome(i<6?.01:-.005,i<6?.004:-.008,.025,-.02)}});
const good=summarizeOpportunityValidation(validatedEpisodes,{horizon:5});
assert.equal(good.status,'REVIEW CANDIDATE','well-sampled positive high-score episodes may become review candidates');
assert.equal(good.affectsBuyNow,false,'review candidates must remain unable to affect BUY NOW');
assert.equal(good.shadowOnly,true,'Opportunity Score validation must remain shadow-only');
assert.equal(good.criteria.sampleSize,true);
assert.equal(good.criteria.marketCoverage,true,'review status requires enough market-benchmark outcomes, not just raw stock outcomes');
assert.equal(good.criteria.winRate,true);
assert.equal(good.criteria.positiveExpectancy,true);
assert.equal(good.criteria.positiveMarketExcess,true);
assert.equal(good.criteria.scoreGradient,true,'80+ cohort must outperform the 60–79 comparison cohort');

const badMarket=validatedEpisodes.map((x,i)=>i<OPPORTUNITY_REVIEW_MIN_SAMPLE?{...x,outcomes:{5:outcome(.03,-.01,.05,-.015)}}:x);
const rejected=summarizeOpportunityValidation(badMarket,{horizon:5});
assert.equal(rejected.status,'NOT VALIDATED','negative market excess must block review-candidate status');
assert.equal(rejected.affectsBuyNow,false);

const missingBenchmarks=validatedEpisodes.map((x,i)=>i<10?x:{...x,outcomes:{5:outcome(.03,null,.05,-.015)}});
const weakBenchmarkCoverage=summarizeOpportunityValidation(missingBenchmarks,{horizon:5});
assert.equal(weakBenchmarkCoverage.status,'NOT VALIDATED','incomplete benchmark coverage must block review-candidate status');
assert.equal(weakBenchmarkCoverage.criteria.marketCoverage,false);

const collecting=summarizeOpportunityValidation(validatedEpisodes.slice(0,10),{horizon:5,minSample:10});
assert.equal(collecting.minSample,OPPORTUNITY_REVIEW_MIN_SAMPLE,'callers must never lower the statistical review floor below 30');
assert.equal(collecting.status,'COLLECTING','small samples must remain collecting rather than being promoted');

assert.equal(isOpportunityValidationSlot(Date.UTC(2026,7,26,22,15,0)),true,'18:15 ET weekday is an after-hours validation slot');
assert.equal(isOpportunityValidationSlot(Date.UTC(2026,7,26,20,0,0)),false,'16:00 ET must not run validation');
assert.equal(isOpportunityValidationSlot(Date.UTC(2026,7,29,22,15,0)),false,'weekend validation must remain disabled');

const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');
const scheduler=fs.readFileSync(new URL('../src/scheduler.js',import.meta.url),'utf8');
const validator=fs.readFileSync(new URL('../src/opportunity-validation.js',import.meta.url),'utf8');
const outcomes=fs.readFileSync(new URL('../src/outcomes.js',import.meta.url),'utf8');
assert.match(entry,/\/api\/opportunity-validation/,'production must expose read-only Opportunity Score validation status');
assert.match(entry,/ctx\.waitUntil\(runScheduledCycle\(/,'entry must keep delegating scheduled work to the sole scheduler owner');
assert.doesNotMatch(entry,/runOpportunityValidationCycle/,'entry must not become a second Opportunity Score schedule owner');
assert.match(entry,/clampInt\(url\.searchParams\.get\('minSample'\),OPPORTUNITY_REVIEW_MIN_SAMPLE,100,OPPORTUNITY_REVIEW_MIN_SAMPLE\)/,'public validation endpoint must not lower the 30-sample floor');
assert.match(scheduler,/runOpportunityValidationCycle/,'scheduler owner must run Opportunity Score validation after hours');
assert.match(scheduler,/async function runAfterHoursCycle/,'Opportunity validation must remain in the existing after-hours lane');
assert.match(scheduler,/opportunityValidation:\{afterHours:true,shadowOnly:true,affectsBuyNow:false\}/,'scheduler coverage must expose shadow-only Opportunity validation');
assert.match(entry,/opportunityScoreAffectsBuyNow:false/,'health must explicitly preserve the BUY firewall');
assert.match(validator,/runOutcomeTracker\(env,\{now,maxSymbols:[\s\S]*observationType:'RADAR'/,'Opportunity validation must prioritize RADAR evidence in the existing outcome tracker');
assert.match(validator,/querySince=since-OPPORTUNITY_EPISODE_GAP_MS/,'lookback must include a pre-window episode buffer');
assert.match(validator,/FIRST_THRESHOLD_CROSSING_PER_EPISODE/,'validation must count episodes rather than repeated 15-minute observations');
assert.match(validator,/marketCoverage:highScore\.marketSampleSize>=requiredSample/,'review status must require benchmark coverage equal to the sample floor');
assert.match(validator,/affectsBuyNow:false/,'validation module must never authorize BUY NOW');
assert.match(outcomes,/observationType=null/,'generic outcome tracker must keep its existing all-evidence default');
assert.match(outcomes,/e\.observation_type=\?/,'generic outcome tracker must support a targeted evidence type when requested');
assert.doesNotMatch(validator,/recordSignal\(|hardBuyGuardrails\s*=|status\s*=\s*['"]BUY NOW/,'validation must not mutate live trading state');

console.log('Stage 15.7 Opportunity Score forward outcome validation checks passed.');

function row(id,symbol,observedAt,features,outcomes){return{id,symbol,observedAt,price:100,...features,outcomes};}
function outcome(forwardReturn,marketExcessReturn,mfe=.04,mae=-.02){return{horizonSessions:5,forwardReturn,mfe,mae,marketExcessReturn};}
