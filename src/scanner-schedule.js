export const BROAD_DISCOVERY_SCHEDULE=Object.freeze({
  timezone:'America/New_York',
  weekdays:Object.freeze(['Mon','Tue','Wed','Thu']),
  startMinuteEt:9*60+45,
  endMinuteEt:15*60+30,
  cadenceMinutes:15,
  extendedHours:false,
  fridayBroadDiscovery:false
});

export function isBroadDiscoverySlot(weekday,minutes){
  const m=Number(minutes);
  return BROAD_DISCOVERY_SCHEDULE.weekdays.includes(String(weekday||''))&&Number.isFinite(m)&&m>=BROAD_DISCOVERY_SCHEDULE.startMinuteEt&&m<=BROAD_DISCOVERY_SCHEDULE.endMinuteEt&&m%BROAD_DISCOVERY_SCHEDULE.cadenceMinutes===0;
}

export function broadDiscoveryCoverage(){
  const s=BROAD_DISCOVERY_SCHEDULE;
  return{
    timezone:s.timezone,
    weekdays:[...s.weekdays],
    startEt:clock(s.startMinuteEt),
    endEt:clock(s.endMinuteEt),
    cadenceMinutes:s.cadenceMinutes,
    extendedHours:s.extendedHours,
    fridayBroadDiscovery:s.fridayBroadDiscovery,
    note:'Broad discovery currently scans Monday–Thursday from 09:45–15:30 ET. Premarket/overnight movement and Friday broad discovery are outside this scanner schedule.'
  };
}
function clock(minutes){const h=Math.floor(minutes/60),m=minutes%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
