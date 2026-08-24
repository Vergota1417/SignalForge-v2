import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const radar=read('src/radar.js');
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
  ['Radar quarantines permanent provider failures',/quarantineDiscoverySymbol/.test(radar)&&/twelve-data-symbol-rejected/.test(radar)],
  ['Radar preserves provider HTTP status',/error\.status=response\.status/.test(radar)],
  ['Radar operation error contains symbol and quarantine state',/quarantined:Boolean\(quarantine\)/.test(radar)&&/errors\.push\(row\)/.test(radar)],
  ['operations UI names failed symbol',/radarErr\.symbol/.test(opsUi)&&/quarantined/.test(opsUi)],
  ['release version v2.30.6',/version:'2\.30\.6'/.test(build)],
  ['PWA shell v30-6',/signalforge-shell-v30-6/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} discovery-quarantine checks failed.`);process.exit(1);}console.log(`PASS ${checks.length}/${checks.length} Stage 14.6 discovery-quarantine checks.`);
