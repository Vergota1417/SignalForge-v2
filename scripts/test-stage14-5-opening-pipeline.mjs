import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const entry=read('src/entry.js');
const wrangler=read('wrangler.jsonc');
const opsUi=read('public/operations-ui.js');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['five-minute guarded scheduler',/"crons"\s*:\s*\["\*\/5 \* \* \* \*"\]/.test(wrangler)],
  ['opening sweeps at 9:30, 9:35, 9:40 ET',/new Set\(\[570,575,580\]\)/.test(entry)],
  ['weekday opening eligibility includes Friday',/day==='Fri'/.test(entry)&&/OPENING_SCAN_MINUTES\.has\(minutes\)/.test(entry)],
  ['Friday regular discovery restored',/weekday==='Fri'&&minutes>=585&&minutes<840&&minutes%15===0/.test(entry)],
  ['opening pipeline records operation proof',/recordOperation\(env,operationKey/.test(entry)&&/'opening-pipeline'/.test(entry)],
  ['opening cycle scans real radar',/runRadarDiscovery\(env,\{batchSize:5,now\}\)/.test(entry)],
  ['opening cycle can promote one candidate',/runScreenerPromotion\(env,\{maxPromotions:1,now\}\)/.test(entry)],
  ['operations UI exposes opening pipeline',/Opening pipeline/i.test(opsUi)&&/opening-pipeline/.test(opsUi)],
  ['production exposes a 2.30.x release',/version:'2\.30\.\d+'/.test(build)],
  ['production uses a versioned v30 shell',/signalforge-shell-v30-\d+/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} opening-pipeline checks failed.`);process.exit(1);}console.log(`PASS ${checks.length}/${checks.length} Stage 14.5 opening-pipeline checks.`);
