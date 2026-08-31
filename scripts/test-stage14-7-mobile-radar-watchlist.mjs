import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const watch=read('public/watchlist-ui.js');
const radar=read('public/radar-ui.js');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['watchlist persists locally',/signalforge_pinned_watchlist_v1/.test(watch)&&/localStorage\.setItem/.test(watch)],
  ['watchlist editor identifies My Watchlist',/My Watchlist/.test(watch)&&/editWatchlistBtn/.test(watch)],
  ['watchlist supports add remove and defaults',/data-add/.test(watch)&&/data-remove/.test(watch)&&/Restore defaults/.test(watch)],
  ['watchlist remains provider-free and reads saved signals',/\/api\/signals/.test(watch)&&!/api\/market-data/.test(watch)&&!/twelvedata/.test(watch)],
  ['top Opportunity Radar swipe strip exists',/sfRadarStrip/.test(radar)&&/sfRadarSwipe/.test(radar)],
  ['Radar strip uses horizontal scroll snap',/scroll-snap-type:x mandatory/.test(radar)&&/grid-auto-flow:column/.test(radar)],
  ['Radar strip keeps decision metrics',/Movement<b>/.test(radar)&&/Ready<b>/.test(radar)&&/Gates<b>/.test(radar)&&/RVOL<b>/.test(radar)],
  ['Radar strip reuses automatic D1 endpoint',/\/api\/opportunity-radar/.test(radar)],
  ['mobile hides duplicate sidebar Radar',/@media\(max-width:760px\)[\s\S]*?\.radar-block\{display:none!important\}/.test(radar)],
  ['production exposes a 2.30.x release',/version:'2\.30\.\d+'/.test(build)],
  ['production uses a versioned v30 shell',/signalforge-shell-v30-\d+/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} mobile Radar/watchlist checks failed.`);process.exit(1);}
console.log(`PASS ${checks.length}/${checks.length} Stage 14.7 mobile Radar/watchlist checks.`);
