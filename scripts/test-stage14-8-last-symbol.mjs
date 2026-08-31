import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const last=read('public/last-symbol-ui.js');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['last-symbol storage key exists',/signalforge_last_symbol_v1/.test(last)],
  ['deep-link symbol keeps startup priority',/if\(!deepLink&&remembered\)/.test(last)],
  ['remembered-symbol implementation can update browser URL',/history\.replaceState/.test(last)],
  ['displayed ticker changes persist successful symbol',/MutationObserver\(rememberDisplayedSymbol\)/.test(last)&&/localStorage\.setItem\(KEY,symbol\)/.test(last)],
  ['successful displayed ticker synchronizes URL',/sanitize\(params\.get\('symbol'\)\)!==symbol/.test(last)&&/params\.set\('symbol',symbol\)/.test(last)&&/history\.replaceState/.test(last)],
  ['production exposes a 2.30.x release',/version:'2\.30\.\d+'/.test(build)],
  ['production retains a versioned PWA shell',/signalforge-shell-v30-\d+/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} last-symbol checks failed.`);process.exit(1);}
console.log(`PASS ${checks.length}/${checks.length} last-symbol refresh checks.`);
