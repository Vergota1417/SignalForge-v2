import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const visual=read('../public/visual-dashboard-ui.js');
const workspace=read('../public/workspace-ui.js');
const sw=read('../public/service-worker.js');
const build=read('../public/build-info.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(workspace,/visual-dashboard-ui\.js/,'existing workspace owner must load the visual dashboard module without replacing trading logic');
assert.match(visual,/grid-template-areas:'profile profile profile' 'left chart right' 'left volume right' 'validation validation validation'/,'desktop workspace must follow the requested profile / left / chart / right / validation hierarchy');
assert.match(visual,/Recently viewed/,'left rail must provide recent-stock navigation');
assert.match(visual,/What should I do\?/,'left rail must keep the current SignalForge action visible');
assert.match(visual,/Price \+ decision levels/,'right rail must expose current price and trading levels');
assert.match(visual,/Pattern \+ structure context/,'right rail must expose proven pattern/structure context');
assert.match(visual,/Related companies/,'right rail must reserve a dedicated related-company comparison area');
assert.match(visual,/Sector\/industry peer feed not validated yet/,'missing peer data must be stated rather than fabricated');
assert.match(visual,/Volume \+ market pressure/,'volume must have a dedicated block linked to the loaded stock/timeframe');
assert.match(visual,/true buyer-vs-seller aggression requires bid\/ask trade data/,'OHLCV must not be mislabeled as true order-flow control');
assert.match(visual,/DATA VALIDATION · PROVE WHAT WAS PULLED/,'bottom area must be a strong expandable validation tab');
assert.match(visual,/<details class="sf-data-audit">/,'validation proof must be collapsed by default and expandable on demand');
assert.doesNotMatch(visual,/<details class="sf-data-audit"[^>]*open/,'validation proof must not overwhelm the normal dashboard by opening automatically');
assert.match(visual,/Market candles/,'validation drawer must prove market candle inputs');
assert.match(visual,/Symbol metadata/,'validation drawer must prove identity metadata');
assert.match(visual,/Corporate profile depth/,'validation drawer must identify unavailable profile depth');
assert.match(visual,/Decision levels/,'validation drawer must prove displayed decision levels');
assert.match(visual,/Volume \/ execution/,'validation drawer must prove volume/execution data');
assert.match(visual,/Auction \/ patterns/,'validation drawer must prove auction/pattern inputs');
assert.match(visual,/Recent news/,'validation drawer must report news-data availability');
assert.match(visual,/No validated news provider is connected/,'news must remain visibly unverified until a real source is connected');
assert.match(visual,/missing inputs remain visible and are never synthesized/,'visual completeness must never hide missing evidence');
assert.doesNotMatch(visual,/\bfetch\s*\(/,'visual workspace must reuse already-loaded data and create zero new provider traffic');
assert.match(visual,/observer\?\.disconnect\(\)/,'layout must suppress its own MutationObserver redraws to avoid a Windows/browser refresh loop');

assert.equal(pkg.version,'2.30.50');
assert.match(build,/version:'2\.30\.50'/);
assert.match(build,/release:'visual-dashboard-workspace'/);
assert.match(build,/shell:'v30-50'/);
assert.match(sw,/signalforge-shell-v30-50/,'PWA shell must invalidate the previous dashboard layout');
assert.match(sw,/visual-dashboard-ui\.js/,'visual dashboard module must be available to installed PWA clients');
assert.match(sw,/signalforge-api-snapshots-v11/,'UI-only layout must not spend or invalidate provider/API snapshots');

console.log('Stage 16.11 visual dashboard layout regression: PASS');
