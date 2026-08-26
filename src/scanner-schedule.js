export const MARKET_WEEKDAYS=Object.freeze(['Mon','Tue','Wed','Thu','Fri']);
export const OPENING_SCAN_MINUTES=Object.freeze([570,575,580]);
export const RADAR_BATCH_SIZE=5;

export const BROAD_DISCOVERY_SCHEDULE=Object.freeze({
  timezone:'America/New_York',
  weekdays:MARKET_WEEKDAYS,
  startMinuteEt:9*60+45,
  endMinuteEt:15*60+30,
  cadenceMinutes:15,
  extendedHours:false,
  fridayBroadDiscovery:true
});

export const PRIORITY_EXECUTION_SCHEDULE=Object.freeze({
  weekdays:MARKET_WEEKDAYS,
  startMinuteEt:9*60+50,
  endMinuteEt:15*60+55,
  cadenceMinutes:5,
  completed15mBoundariesReservedForDiscovery:true
});

export const PORTFOLIO_CLOSE_REVIEW_MINUTE_ET=15*60+45;

export const AFTER_HOURS_RESEARCH_SCHEDULE=Object.freeze({
  weekdays:MARKET_WEEKDAYS,
  startMinuteEt:16*60+15,
  endMinuteEt:18*60+45,
  cadenceMinutes:30
});

// Weekly 1Y research is deliberately moved off the live Friday session.
// Six Saturday batches x six symbols can cover the 36-symbol weekly research universe
// without competing with Friday broad discovery, execution confirmation, or position monitoring.
export const WEEKLY_RESEARCH_SCHEDULE=Object.freeze({
  weekday:'Sat',
  startMinuteEt:11*60+15,
  endMinuteEt:12*60+30,
  cadenceMinutes:15,
  batchSize:6,
  plannedRuns:6
});

export const WEEKEND_RESEARCH_SCHEDULE=Object.freeze({weekday:'Sat',minuteEt:13*60,maxPerRun:6});
export const WEEKEND_SUMMARY_SCHEDULE=Object.freeze({weekday:'Sun',minuteEt:11*60+15});

export function isMarketWeekday(day){return MARKET_WEEKDAYS.includes(String(day||''));}

export function isOpeningScanSlot(weekday,minutes){
  return isMarketWeekday(weekday)&&OPENING_SCAN_MINUTES.includes(Number(minutes));
}

export function openingScanLabel(minutes){
  const m=Number(minutes);
  return m===570?'OPENING SWEEP 1':m===575?'OPENING SWEEP 2':m===580?'OPENING SWEEP 3':'OPENING SWEEP';
}

export function isBroadDiscoverySlot(weekday,minutes){
  const s=BROAD_DISCOVERY_SCHEDULE,m=Number(minutes);
  return s.weekdays.includes(String(weekday||''))&&Number.isFinite(m)&&m>=s.startMinuteEt&&m<=s.endMinuteEt&&m%s.cadenceMinutes===0;
}

export function isPriorityExecutionSlot(weekday,minutes){
  const s=PRIORITY_EXECUTION_SCHEDULE,m=Number(minutes);
  return s.weekdays.includes(String(weekday||''))&&Number.isFinite(m)&&m>=s.startMinuteEt&&m<=s.endMinuteEt&&m%s.cadenceMinutes===0&&m%BROAD_DISCOVERY_SCHEDULE.cadenceMinutes!==0;
}

export function isPortfolioCloseReviewSlot(weekday,minutes){return isMarketWeekday(weekday)&&Number(minutes)===PORTFOLIO_CLOSE_REVIEW_MINUTE_ET;}

export function isAfterHoursResearchSlot(weekday,minutes){
  const s=AFTER_HOURS_RESEARCH_SCHEDULE,m=Number(minutes);
  return s.weekdays.includes(String(weekday||''))&&Number.isFinite(m)&&m>=s.startMinuteEt&&m<=s.endMinuteEt&&m%s.cadenceMinutes===15;
}

export function isWeeklyResearchSlot(weekday,minutes){
  const s=WEEKLY_RESEARCH_SCHEDULE,m=Number(minutes);
  return String(weekday||'')===s.weekday&&Number.isFinite(m)&&m>=s.startMinuteEt&&m<=s.endMinuteEt&&m%s.cadenceMinutes===0;
}

export function isWeekendResearchSlot(weekday,minutes){const s=WEEKEND_RESEARCH_SCHEDULE;return String(weekday||'')===s.weekday&&Number(minutes)===s.minuteEt;}
export function isWeekendSummarySlot(weekday,minutes){const s=WEEKEND_SUMMARY_SCHEDULE;return String(weekday||'')===s.weekday&&Number(minutes)===s.minuteEt;}

export function discoveryProviderEnvelope(){
  const broadRuns=Math.floor((BROAD_DISCOVERY_SCHEDULE.endMinuteEt-BROAD_DISCOVERY_SCHEDULE.startMinuteEt)/BROAD_DISCOVERY_SCHEDULE.cadenceMinutes)+1;
  const openingRuns=OPENING_SCAN_MINUTES.length;
  return{
    radarBatchSize:RADAR_BATCH_SIZE,
    openingRunsPerMarketDay:openingRuns,
    broadRunsPerMarketDay:broadRuns,
    maxScheduledRadarQuoteRequestsPerMarketDay:(openingRuns+broadRuns)*RADAR_BATCH_SIZE,
    providerDailyHardCap:700,
    note:'This envelope covers scheduled Radar quote requests only. Promotion, execution, portfolio, and research requests remain separately quota-guarded.'
  };
}

export function broadDiscoveryCoverage(){
  const s=BROAD_DISCOVERY_SCHEDULE,envelope=discoveryProviderEnvelope();
  return{
    timezone:s.timezone,
    weekdays:[...s.weekdays],
    startEt:clock(s.startMinuteEt),
    endEt:clock(s.endMinuteEt),
    cadenceMinutes:s.cadenceMinutes,
    extendedHours:s.extendedHours,
    fridayBroadDiscovery:s.fridayBroadDiscovery,
    openingSweepsEt:OPENING_SCAN_MINUTES.map(clock),
    maxScheduledRadarQuoteRequestsPerMarketDay:envelope.maxScheduledRadarQuoteRequestsPerMarketDay,
    weeklyResearchWindow:`${WEEKLY_RESEARCH_SCHEDULE.weekday} ${clock(WEEKLY_RESEARCH_SCHEDULE.startMinuteEt)}-${clock(WEEKLY_RESEARCH_SCHEDULE.endMinuteEt)} ET`,
    note:'Broad discovery scans every market weekday from 09:45-15:30 ET after dedicated 09:30/09:35/09:40 opening sweeps. Weekly 1Y research runs Saturday so it cannot displace live Friday discovery. Premarket and postmarket broad discovery remain disabled until extended-hours evidence is validated.'
  };
}

export function schedulerCoverage(){
  return{
    timezone:BROAD_DISCOVERY_SCHEDULE.timezone,
    openingSweepsEt:OPENING_SCAN_MINUTES.map(clock),
    broadDiscovery:broadDiscoveryCoverage(),
    priorityExecution:{startEt:clock(PRIORITY_EXECUTION_SCHEDULE.startMinuteEt),endEt:clock(PRIORITY_EXECUTION_SCHEDULE.endMinuteEt),cadenceMinutes:PRIORITY_EXECUTION_SCHEDULE.cadenceMinutes},
    portfolioCloseReviewEt:clock(PORTFOLIO_CLOSE_REVIEW_MINUTE_ET),
    afterHoursResearch:{startEt:clock(AFTER_HOURS_RESEARCH_SCHEDULE.startMinuteEt),endEt:clock(AFTER_HOURS_RESEARCH_SCHEDULE.endMinuteEt),cadenceMinutes:AFTER_HOURS_RESEARCH_SCHEDULE.cadenceMinutes},
    weeklyResearch:{weekday:WEEKLY_RESEARCH_SCHEDULE.weekday,startEt:clock(WEEKLY_RESEARCH_SCHEDULE.startMinuteEt),endEt:clock(WEEKLY_RESEARCH_SCHEDULE.endMinuteEt),cadenceMinutes:WEEKLY_RESEARCH_SCHEDULE.cadenceMinutes,batchSize:WEEKLY_RESEARCH_SCHEDULE.batchSize},
    weekendResearch:{weekday:WEEKEND_RESEARCH_SCHEDULE.weekday,atEt:clock(WEEKEND_RESEARCH_SCHEDULE.minuteEt)},
    weekendSummary:{weekday:WEEKEND_SUMMARY_SCHEDULE.weekday,atEt:clock(WEEKEND_SUMMARY_SCHEDULE.minuteEt)}
  };
}

function clock(minutes){const h=Math.floor(minutes/60),m=minutes%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
