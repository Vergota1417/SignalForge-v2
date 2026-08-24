import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const last=read('public/last-symbol-ui.js');
const index=read('public/index.html');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['last-symbol storage key exists',/signalforge_last_symbol_v1/.test(last)],
  ['deep-link symbol keeps priority',/if\(!deepLink&&remembered\)/.test(last)],
  ['remembered symbol is restored into URL before app load',/history\.replaceState/.test(last)&&index.indexOf('last-symbol-ui.js')<index.indexOf('app.js')],
  ['displayed ticker changes persist the successful symbol',/MutationObserver\(rememberDisplayedSymbol\)/.test(last)&&/localStorage\.setItem\(KEY,symbol\)/.test(last)],
  ['release version v2.30.9',/version:'2\.30\.9'/.test(build)],
  ['PWA shell v30-9 caches module',/signalforge-shell-v30-9/.test(sw)&&/last-symbol-ui\.js/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} last-symbol checks failed.`);process.exit(1);}
console.log(`PASS ${checks.length}/${checks.length} Stage 14.8 last-symbol checks.`);
