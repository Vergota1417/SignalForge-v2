import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const index=read('../public/index.html');
const workspace=read('../public/workspace-ui.js');
const router=read('../public/ui-router.js');
const studio=read('../public/chart-studio-ui.js');
const pwa=read('../public/pwa.js');
const auction=read('../public/auction-method-ui.js');
const integrity=read('../public/signal-integrity-ui.js');
const build=read('../public/build-info.js');
const sw=read('../public/service-worker.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(index,/id="analysisNavBtn"[^>]*>Analysis</,'Analysis must be a real primary navigation destination');
assert.match(index,/id="systemNavBtn"[^>]*>System</,'System must be a real primary navigation destination');
assert.match(index,/workspace-ui\.js/,'workspace organizer must be loaded by the shell');
assert.match(router,/showDock\('sfAnalysisDock'/,'router must navigate to the Analysis dock instead of expanding it inside Dashboard');
assert.match(router,/showDock\('sfSystemDock'/,'router must navigate to the System dock instead of expanding it inside Dashboard');
assert.match(workspace,/body:not\(\.sf-view-screener\) #sfMarketCrawler\{display:none!important\}/,'scrolling crawler must not compete with the everyday Dashboard');
assert.match(workspace,/radar-item:nth-child\(n\+4\)\{display:none!important\}/,'Dashboard Radar must limit itself to the first three candidates');
assert.match(workspace,/Open Full Screener →/,'compact Radar must provide a clear path to the complete Screener');
assert.match(workspace,/sf-chart-details-open/,'chart diagnostics must be progressively disclosed on Dashboard');
assert.match(workspace,/SYSTEM HEALTHY/,'Dashboard must reduce backend diagnostics to a compact system-health summary');
assert.match(workspace,/ANALYSIS_SELECTORS=.*#sfAuctionMethod/,'Auction Method belongs on the Analysis workspace');
assert.match(workspace,/SYSTEM_SELECTORS=.*#sfExecutionTrace/,'execution trace belongs on the System workspace');

assert.match(integrity,/No walk-forward sample exists yet/,'zero samples must remain UNKNOWN rather than display a fake percentage');
assert.match(integrity,/ratio is not trusted because the structural stop is too tight/,'summary copy must explain why a large R\/R can still be blocked');

assert.match(studio,/SignalForge Chart Studio/,'full-screen visual analysis studio must exist');
assert.match(studio,/cacheOnly=1/,'Chart Studio must prefer existing cached market data');
assert.match(studio,/response\.status===404&&allowProvider/,'provider use for a missing timeframe must require an explicit timeframe action');
assert.match(studio,/symbol=SPY[^`]*cacheOnly=1/,'relative-strength visualization must be cache-only and must not silently spend a provider request');
assert.match(studio,/SMA 20\/50/,'trend moving-average layer must be available');
assert.match(studio,/regressionChannel/,'structure layer must derive a visual regression channel');
assert.match(studio,/30-bar support/,'structure layer must show support context');
assert.match(studio,/30-bar resistance/,'structure layer must show resistance context');
assert.match(studio,/POC/,'Auction POC must be visualizable');
assert.match(studio,/VAH/,'Auction value-area high must be visualizable');
assert.match(studio,/VAL/,'Auction value-area low must be visualizable');
assert.match(studio,/rsiData/,'RSI pane must be calculated locally from verified candles');
assert.match(studio,/window\.__sfDecisionMarkers/,'saved SignalForge transitions must be reusable as chart evidence markers');
assert.match(studio,/Footprint<\/button>/,'Footprint layer must be visible but disabled until real feed support exists');
assert.match(studio,/GEX<\/button>/,'GEX layer must be visible but disabled until real feed support exists');
assert.match(studio,/MBO<\/button>/,'MBO layer must be visible but disabled until real feed support exists');
assert.match(studio,/Visual layers are explanatory only and cannot create BUY NOW/,'Chart Studio must remain observational and unable to authorize trades');
assert.match(auction,/window\.__sfAuctionContext=a\|\|null/,'Auction UI must expose its already-calculated context without forcing Chart Studio to create a second auction request');
assert.match(pwa,/chart-studio-ui\.js/,'Chart Studio must be part of the PWA runtime');

assert.equal(pkg.version,'2.30.48');
assert.match(build,/version:'2\.30\.48'/);
assert.match(build,/release:'workspace-chart-studio'/);
assert.match(build,/shell:'v30-48'/);
assert.match(sw,/signalforge-shell-v30-48/,'PWA shell must invalidate the previous dense interface');
assert.match(sw,/workspace-ui\.js/,'workspace code must be cached for installed PWA use');
assert.match(sw,/chart-studio-ui\.js/,'Chart Studio must be cached for installed PWA use');
assert.match(sw,/signalforge-api-snapshots-v10/,'UI reorganization must not invalidate API snapshots unnecessarily');

console.log('Stage 16.9 workspace + Chart Studio regression: PASS');
