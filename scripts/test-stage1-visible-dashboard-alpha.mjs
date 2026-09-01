import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const html=read('../public/index.html');
const ui=read('../public/dashboard-alpha.js');
const entry=read('../src/entry.js');
const method=read('../src/method/five-stage-alpha.js');
const market=read('../src/market.js');

assert.match(html,/RandomSTOCKASAN FIXed example/,'dashboard must keep the fixed placeholder before a stock is selected');
assert.doesNotMatch(html,/\bXOM\b|\bAAPL\b|\bNVDA\b|\bMSFT\b|\bTSLA\b/,'dashboard HTML must not hard-code a real stock example');
for(const block of ['stock-header','recently-viewed','decision','main-chart','price-levels','pattern-structure','volume-pressure','related-companies','news-catalysts','data-validation']){
  assert.match(html,new RegExp(`data-block="${block}"`),`dashboard must preserve ${block}`);
}
assert.match(html,/What Should I Do\?/);
assert.match(html,/Investment Quality/);
assert.match(html,/News \+ Catalysts/);
assert.match(html,/<details class="sf-zero-validation" data-block="data-validation">/,'validation drawer must exist');
assert.doesNotMatch(html,/<details class="sf-zero-validation"[^>]*open/,'validation drawer must remain collapsed by default');
assert.match(html,/dashboard-alpha\.js/,'working alpha script must be loaded');

assert.match(ui,/fetch\(`\/api\/symbol-master\?symbol=/,'browser must consume one centralized selected-symbol endpoint');
assert.doesNotMatch(ui,/\/api\/market-data|alpaca\.markets|twelvedata/i,'dashboard must not call providers or lower-level market-data routes directly');
assert.match(ui,/Investment Quality, Portfolio Allocation, and Portfolio Risk are still separate release blockers/,'UI must state the alpha product boundary');
assert.match(ui,/Data Validation|validation-body/,'UI must render data proof');

assert.match(entry,/url\.pathname==='\/api\/symbol-master'/,'entry must expose the selected-symbol master endpoint');
assert.match(entry,/getMarketData\(env,symbol,'6M'/,'master endpoint must use the analysis dataset');
assert.match(entry,/getMarketData\(env,symbol,'5D'/,'master endpoint must use the execution dataset');
assert.match(entry,/getMarketData\(env,'SPY','6M'/,'master endpoint must use the benchmark dataset');
assert.match(entry,/buildFiveStageAlpha\(analysis(?:,[^)]+)?\)/,'master endpoint must produce the five-stage view');
assert.match(entry,/investmentQuality:true,portfolioAllocation:true,portfolioRisk:true/,'unimplemented wealth authorities must be explicit rather than fabricated');
assert.match(entry,/releaseEligible:false/,'working alpha must remain blocked from final release');

for(const stage of ['environment','location','path','confirmation','execution']){
  assert.match(method,new RegExp(`stage\\('${stage}'`),`five-stage adapter must contain ${stage}`);
}
assert.match(method,/const executionState=hard\?\.pass\?'PASS':'LOCKED'/,'Execution must remain locked unless authoritative hard BUY guardrails pass');
assert.match(method,/hardBuyGuardrails:hard/,'adapter must consume authoritative hard guardrails');
assert.doesNotMatch(method,/MIN_BUY_REWARD_RISK|MIN_BUY_STOP_DISTANCE|from ['"]\.\.\/\.\.\/hard-guardrails/i,'adapter must not redefine or import production BUY thresholds');
assert.match(method,/releaseEligible:false/,'interim adapter must not claim release eligibility');

assert.match(market,/PREVIEW_PROXY/,'alpha must identify preview-proxy provenance explicitly');
assert.match(market,/No market-data provider is configured/,'preview fallback must activate only after the normal provider gateway reports no configured provider');

console.log('Stage 1 visible dashboard alpha regression: PASS');
