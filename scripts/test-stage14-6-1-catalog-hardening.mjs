import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const quarantine=read('src/discovery-quarantine.js');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['permanent provider rejection marks catalog ineligible',/UPDATE discovery_catalog SET eligible=0/.test(quarantine)],
  ['permanent provider rejection removes discovery pool entry',/DELETE FROM discovery_weekly_pool/.test(quarantine)],
  ['permanent provider rejection removes weekly research entry',/DELETE FROM discovery_weekly_universe/.test(quarantine)],
  ['cooldown remains as a safety backstop',/cooldown_until/.test(quarantine)&&/DEFAULT_QUARANTINE_MS/.test(quarantine)],
  ['release version v2.30.7',/version:'2\.30\.7'/.test(build)],
  ['PWA shell v30-7',/signalforge-shell-v30-7/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} catalog-hardening checks failed.`);process.exit(1);}console.log(`PASS ${checks.length}/${checks.length} Stage 14.6.1 catalog-hardening checks.`);
