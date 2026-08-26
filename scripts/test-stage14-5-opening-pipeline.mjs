import fs from 'node:fs';
import { isBroadDiscoverySlot, isOpeningScanSlot, isWeeklyResearchSlot } from '../src/scanner-schedule.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const entry=read('src/entry.js');
const scheduler=read('src/scheduler.js');
const wrangler=read('wrangler.jsonc');
const opsUi=read('public/operations-ui.js');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['five-minute guarded scheduler',/"crons"\s*:\s*\["\*\/5 \* \* \* \*"\]/.test(wrangler)],
  ['opening sweeps at 9:30, 9:35, 9:40 ET',isOpeningScanSlot('Mon',570)&&isOpeningScanSlot('Wed',575)&&isOpeningScanSlot('Fri',580)],
  ['Friday opening eligibility remains active',isOpeningScanSlot('Fri',570)],
  ['Friday regular discovery covers the full 09:45-15:30 window',isBroadDiscoverySlot('Fri',585)&&isBroadDiscoverySlot('Fri',930)&&!isBroadDiscoverySlot('Fri',935)],
  ['Friday weekly research no longer displaces live discovery',!isWeeklyResearchSlot('Fri',840)&&isWeeklyResearchSlot('Sat',675)],
  ['entry delegates scheduled work to one scheduler owner',/runScheduledCycle\(env,Number\(controller\.scheduledTime\)/.test(entry)],
  ['opening pipeline records operation proof',/recordOperation\(env,operationKey/.test(scheduler)&&/'opening-pipeline'/.test(scheduler)],
  ['opening cycle scans real radar',/runRadarDiscovery\(env,\{batchSize:RADAR_BATCH_SIZE,now\}\)/.test(scheduler)],
  ['opening cycle can promote one candidate',/runScreenerPromotion\(env,\{maxPromotions:1,now\}\)/.test(scheduler)],
  ['operations UI exposes opening pipeline',/Opening pipeline/i.test(opsUi)&&/opening-pipeline/.test(opsUi)],
  ['production exposes a 2.30.x release',/version:'2\.30\.\d+'/.test(build)],
  ['production uses a versioned v30 shell',/signalforge-shell-v30-\d+/.test(sw)]
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} opening-pipeline checks failed.`);process.exit(1);}console.log(`PASS ${checks.length}/${checks.length} Stage 14.5 opening-pipeline checks.`);
