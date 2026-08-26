import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BROAD_DISCOVERY_SCHEDULE,
  OPENING_SCAN_MINUTES,
  WEEKLY_RESEARCH_SCHEDULE,
  broadDiscoveryCoverage,
  discoveryProviderEnvelope,
  isAfterHoursResearchSlot,
  isBroadDiscoverySlot,
  isOpeningScanSlot,
  isPortfolioCloseReviewSlot,
  isPriorityExecutionSlot,
  isWeekendResearchSlot,
  isWeekendSummarySlot,
  isWeeklyResearchSlot,
  schedulerCoverage
} from '../src/scanner-schedule.js';

for(const day of ['Mon','Tue','Wed','Thu','Fri']){
  assert.equal(isOpeningScanSlot(day,570),true,`${day} must run the 09:30 opening sweep`);
  assert.equal(isOpeningScanSlot(day,575),true,`${day} must run the 09:35 opening sweep`);
  assert.equal(isOpeningScanSlot(day,580),true,`${day} must run the 09:40 opening sweep`);
  assert.equal(isBroadDiscoverySlot(day,585),true,`${day} must begin broad discovery at 09:45`);
  assert.equal(isBroadDiscoverySlot(day,930),true,`${day} must retain broad discovery through 15:30`);
  assert.equal(isBroadDiscoverySlot(day,935),false,`${day} broad discovery must stop after 15:30`);
  assert.equal(isPriorityExecutionSlot(day,590),true,`${day} must retain 09:50 priority execution`);
  assert.equal(isPriorityExecutionSlot(day,600),false,`${day} quarter-hour boundary must remain reserved from the five-minute pulse lane`);
  assert.equal(isPriorityExecutionSlot(day,955),true,`${day} must retain the 15:55 priority pulse`);
  assert.equal(isPortfolioCloseReviewSlot(day,945),true,`${day} must retain the 15:45 portfolio close review`);
  assert.equal(isAfterHoursResearchSlot(day,975),true,`${day} must retain 16:15 after-hours research`);
  assert.equal(isAfterHoursResearchSlot(day,1125),true,`${day} must retain 18:45 after-hours research/summary`);
}

assert.equal(BROAD_DISCOVERY_SCHEDULE.fridayBroadDiscovery,true,'Friday must be a first-class broad-discovery day');
assert.deepEqual([...OPENING_SCAN_MINUTES],[570,575,580]);
assert.equal(isWeeklyResearchSlot('Fri',840),false,'weekly research must not consume live Friday 14:00 discovery');
assert.equal(isWeeklyResearchSlot('Sat',675),true,'weekly research must start Saturday 11:15 ET');
assert.equal(isWeeklyResearchSlot('Sat',750),true,'sixth Saturday weekly batch must run at 12:30 ET');
assert.equal(isWeeklyResearchSlot('Sat',765),false,'weekly batch window must close after six planned runs');
assert.equal(WEEKLY_RESEARCH_SCHEDULE.plannedRuns,6);
assert.equal(isWeekendResearchSlot('Sat',780),true,'weekend expansion research must run after weekly batches');
assert.equal(isWeekendSummarySlot('Sun',675),true,'Sunday background summary must remain scheduled');

const broadSlots=[];for(let m=0;m<1440;m+=5)if(isBroadDiscoverySlot('Fri',m))broadSlots.push(m);
assert.equal(broadSlots.length,24,'each market day must have 24 regular quarter-hour discovery slots');
assert.equal(broadSlots[0],585);assert.equal(broadSlots.at(-1),930);
const prioritySlots=[];for(let m=0;m<1440;m+=5)if(isPriorityExecutionSlot('Fri',m))prioritySlots.push(m);
assert.ok(prioritySlots.length>0);
assert.equal(prioritySlots.some(m=>broadSlots.includes(m)),false,'broad discovery and five-minute priority execution must never collide');

const envelope=discoveryProviderEnvelope();
assert.equal(envelope.openingRunsPerMarketDay,3);
assert.equal(envelope.broadRunsPerMarketDay,24);
assert.equal(envelope.radarBatchSize,5);
assert.equal(envelope.maxScheduledRadarQuoteRequestsPerMarketDay,135,'scheduled Radar discovery must have a deterministic quote-request envelope');
assert.ok(envelope.maxScheduledRadarQuoteRequestsPerMarketDay/envelope.providerDailyHardCap<.20,'scheduled Radar quote discovery should consume less than 20% of the default 700-request hard cap');

const coverage=broadDiscoveryCoverage();
assert.deepEqual(coverage.weekdays,['Mon','Tue','Wed','Thu','Fri']);
assert.equal(coverage.extendedHours,false,'extended-hours broad discovery must remain off until separately validated');
assert.equal(coverage.fridayBroadDiscovery,true);
assert.match(coverage.note,/Weekly 1Y research runs Saturday/);
const full=schedulerCoverage();
assert.equal(full.weeklyResearch.weekday,'Sat');
assert.equal(full.weeklyResearch.batchSize,6);

const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');
const scheduler=fs.readFileSync(new URL('../src/scheduler.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
assert.match(entry,/import \{ runScheduledCycle, scheduledCoverage \} from '\.\/scheduler\.js'/,'production entry must import the sole scheduler owner');
assert.match(entry,/ctx\.waitUntil\(runScheduledCycle/,'production entry must route cron work to the sole scheduler owner');
assert.doesNotMatch(entry,/FRIDAY REGULAR|weekday==='Fri'&&minutes>=585/,'entry must not maintain a separate Friday schedule');
assert.doesNotMatch(entry,/app\.scheduled\(/,'production entry must not delegate cron work into a second scheduler');
assert.match(scheduler,/isBroadDiscoverySlot\(weekday,minutes\)/);
assert.match(scheduler,/isWeeklyResearchSlot\(weekday,minutes\)/);
assert.match(scheduler,/runWeeklyResearchBatch\(env,\{batchSize:WEEKLY_RESEARCH_SCHEDULE\.batchSize,now\}\)/);
assert.match(scheduler,/Promise\.all\(\[\s*runPriorityCycle[\s\S]*runPortfolioPulseCycle/,'priority execution and owned-position monitoring must share one central slot owner');
assert.match(index,/broadDiscoveryCoverage:broadDiscoveryCoverage\(\)/,'health must continue exposing discovery coverage');

console.log('Stage 14.43 discovery/scheduler ownership regression passed.');
