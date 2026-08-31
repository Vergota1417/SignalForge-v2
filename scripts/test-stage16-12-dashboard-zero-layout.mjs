import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const html=read('../public/index.html');
const css=read('../public/dashboard-blueprint.css');
const build=read('../public/build-info.js');
const sw=read('../public/service-worker.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(html,/RandomSTOCKASAN FIXed example/,'dashboard blueprint must use the fixed random-stock example instead of a real ticker');
assert.doesNotMatch(html,/\bXOM\b|\bAAPL\b|\bNVDA\b|\bMSFT\b|\bTSLA\b/,'zero-layout page must not hard-code real example tickers');
for(const block of ['stock-header','recently-viewed','decision','main-chart','price-levels','pattern-structure','volume-pressure','related-companies','news-catalysts','data-validation']){
  assert.match(html,new RegExp(`data-block="${block}"`),`dashboard must reserve ${block} block`);
}
assert.match(html,/BLOCK 01/);assert.match(html,/BLOCK 09/);
assert.match(html,/Main Chart/);assert.match(html,/Current Price \+ Levels/);assert.match(html,/Pattern \+ Structure/);assert.match(html,/Volume \+ Market Pressure/);assert.match(html,/Related Companies/);assert.match(html,/News \+ Catalysts/);
assert.match(html,/<details class="sf-zero-validation" data-block="data-validation">/,'validation area must exist as an expandable drawer');
assert.doesNotMatch(html,/<details class="sf-zero-validation"[^>]*open/,'validation drawer must be collapsed by default');
assert.match(html,/No stock API, no chart data, no scanner, no calculations, no live status and no provider requests/,'page must clearly identify the zero-data stage');
assert.doesNotMatch(html,/<script\b/i,'zero-data Dashboard must execute no JavaScript modules');
assert.doesNotMatch(html,/\/api\//i,'zero-data Dashboard must contain no API routes');
assert.doesNotMatch(html,/app\.js|market-data|provider-health|chart-adapter|workspace-ui|visual-dashboard-ui/i,'legacy data/UI modules must not be loaded by the reset page');
assert.match(html,/dashboard-blueprint\.css/,'blueprint must use its dedicated static stylesheet');

assert.match(css,/grid-template-areas:"profile profile profile" "left chart right" "left volume right" "validation validation validation"/,'desktop blueprint must preserve the approved visual hierarchy');
assert.match(css,/@media\(max-width:760px\)/,'blueprint must remain responsive for phone layout');
assert.match(css,/\.sf-zero-chart \.sf-zero-empty\{min-height:500px/,'chart must remain the dominant visual surface on desktop');

assert.equal(pkg.version,'2.30.51');
assert.match(build,/version:'2\.30\.51'/);
assert.match(build,/release:'dashboard-zero-blueprint'/);
assert.match(build,/shell:'v30-51'/);
assert.match(sw,/signalforge-shell-v30-51/,'PWA cache generation must advance for the reset layout');
assert.match(sw,/dashboard-blueprint\.css/,'new static blueprint stylesheet must be available to existing installed clients');
assert.doesNotMatch(sw,/['"]\/app\.js['"]|['"]\/visual-dashboard-ui\.js['"]|['"]\/chart-adapter\.js['"]/,'reset shell must not pre-cache legacy trading UI modules');

console.log('Stage 16.12 zero-data dashboard blueprint regression: PASS');
