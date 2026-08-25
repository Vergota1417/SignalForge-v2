import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessActivityRhythm } from '../src/activity-rhythm.js';
import { assessSessionRange } from '../src/session-range.js';

function session(day,{surgeClose=false}={}){
  const rows=[];let price=100;
  for(let i=0;i<26;i++){
    const minute=9*60+30+i*15,hour=Math.floor(minute/60),min=minute%60;
    const time=Date.UTC(2026,7,day,hour+4,min);
    const edge=Math.abs(i-12.5)/12.5;
    let volume=Math.round(800+2200*edge);
    let move=.0008+.0016*edge;
    if(surgeClose&&i===25){volume=7200;move=.009;}
    const open=price,close=open*(1+(i%2===0?1:-1)*move),pad=open*(.0007+.0010*edge+(surgeClose&&i===25?.006:0));
    rows.push({time,open,high:Math.max(open,close)+pad,low:Math.min(open,close)-pad,close,volume});price=close;
  }
  return rows;
}

const candles=[...session(17),...session(18),...session(19),...session(20),...session(21,{surgeClose:true})];
candles.push({time:Date.UTC(2026,7,21,20,0),open:100,high:100,low:100,close:100,volume:1}); // incomplete candle intentionally dropped

const rhythm=assessActivityRhythm(candles);
assert.equal(rhythm.shadowOnly,true,'Activity Rhythm must start in shadow mode');
assert.equal(rhythm.affectsBuyNow,false,'Activity Rhythm must not change BUY NOW');
assert.equal(rhythm.state,'SURGE','synthetic heavy closing activity should classify as SURGE');
assert.ok(rhythm.score>=85,'surge score should be high');
assert.ok(rhythm.relativeVolume>2,'surge bucket should have materially elevated same-time volume');
assert.ok(Array.isArray(rhythm.profile)&&rhythm.profile.length>=20,'full regular-session time profile should be produced');
const open=rhythm.profile.find(x=>x.time==='09:30'),noon=rhythm.profile.find(x=>x.time==='12:00');
assert.ok(open&&noon&&open.expectedIntensity>noon.expectedIntensity,'synthetic U-shaped history should show a more active open than noon');
assert.equal(rhythm.currentTime,'15:45');

const range=assessSessionRange(candles,{atr:3,currentPrice:rhythm.currentPrice});
assert.equal(range.activityRhythm?.state,'SURGE','Room-to-Run payload should carry Activity Rhythm from the same 15m feed');

const ui=fs.readFileSync(new URL('../public/activity-rhythm-ui.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
assert.match(ui,/INTRADAY ACTIVITY RHYTHM · SHADOW/,'chart must expose Activity Rhythm');
assert.match(ui,/Historical/,'chart must show historical rhythm row');
assert.match(ui,/Session/,'chart must label the saved execution session without implying stale data is today');
assert.match(ui,/matched-session count/,'UI must disclose that the current history is a recent sample');
assert.match(ui,/55% volume-vs-normal/,'calculation weights must be explained');
assert.match(ui,/does not change BUY NOW/,'UI must disclose shadow-only policy');
assert.doesNotMatch(ui,/\/api\/market-data/,'Activity Rhythm UI must not spend provider market-data requests');
assert.match(ui,/\/api\/signals/,'Activity Rhythm UI should read saved analysis only');
assert.ok(pwa.indexOf("/activity-rhythm-ui.js")>pwa.indexOf("/cockpit-ui.js"),'Activity Rhythm UI should load after cockpit organization');
assert.match(sw,/signalforge-shell-v30-24/,'service-worker shell must bump for follow-up polish');
assert.match(sw,/'\/activity-rhythm-ui\.js'/,'installed PWA must cache Activity Rhythm UI');
assert.match(build,/version:'2\.30\.24'/,'visible version must bump for follow-up polish');
assert.match(build,/shell:'v30-24'/,'visible shell must match service worker');

console.log('Stage 14.22 Activity Rhythm regression passed.');
