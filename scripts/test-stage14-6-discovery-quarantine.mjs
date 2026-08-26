import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const radar=read('src/radar.js');
const quoteGateway=read('src/market-quote-gateway.js');
const budget=read('src/scanner-budget.js');
const quarantine=read('src/discovery-quarantine.js');
const opsUi=read('public/operations-ui.js');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['scanner reads all cooldown rows',/FROM discovery_stats`\)\.all\(\)/.test(budget)],
  ['scanner excludes active cooldown symbols',/eligiblePool=pool\.filter\(symbol=>Number\(stats\.get\(symbol\)\?\.cooldownUntil\|\|0\)<=now\)/.test(budget)],
  ['classifier also respects cooldown',/filter\(x=>Number\(x\.cooldownUntil\|\|0\)<=now\)/.test(budget)],
  ['404s are classified as permanent symbol errors',/status===404/.test(quarantine)],
  ['quarantine persists cooldown_until',/cooldown_until=MAX/.test(quarantine)],
  ['Radar retires permanent provider failures through quarantine',/quarantineDiscoverySymbol/.test(radar)&&/market-provider-symbol-permanently-rejected/.test(radar)],
  ['provider gateway preserves provider HTTP status',/error\.status=response\.status/.test(quoteGateway)],
  ['Radar operation proof records retired symbol state',/retired:Boolean\(quarantine\)/.test(radar)&&/retired\.push\(row\)/.test(radar)&&/detail:\{requested:batch\.symbols,scanned:scanned\.map/.test(radar)],
  ['operations UI names retired provider-rejected symbols',/retired\.map\(x=>x\.symbol\)/.test(opsUi)&&/provider-rejected symbol retired/.test(opsUi)],
  ['production exposes a 2.30.x release',/version:'2\.30\.\d+'/.test(build)],
  ['production uses a versioned v30 shell',/signalforge-shell-v30-\d+/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} discovery-quarantine checks failed.`);process.exit(1);}console.log(`PASS ${checks.length}/${checks.length} Stage 14.6 discovery-quarantine checks.`);
