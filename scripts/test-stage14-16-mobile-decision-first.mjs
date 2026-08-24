import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const summary=read('public/decision-summary-ui.js');
const pwa=read('public/pwa.css');
const push=read('public/push.css');
const pushUi=read('public/push-ui.js');
const build=read('public/build-info.js');
const sw=read('public/service-worker.js');

const checks=[
  ['summary shows selected stock',summary.includes('data-summary-symbol')&&summary.includes('data-summary-price')&&summary.includes('data-summary-change')],
  ['mobile simple mode hides bulky hero and chart',summary.includes('body.sf-simple-mode .hero-card')&&summary.includes('body.sf-simple-mode .dashboard-row')],
  ['mobile page puts main decision content before sidebar',pwa.includes('display:flex!important')&&pwa.includes('.main-content{min-width:0;order:1')&&pwa.includes('.sidebar{position:static;order:2')],
  ['alerts are compact on mobile',push.includes('flex:0 0 auto!important')&&!push.includes('flex:1 1 100%;justify-content:center')],
  ['alert labels are concise',pushUi.includes("sub?'Alerts On':'Alerts Off'")&&pushUi.includes("test.textContent='Test Alert'")],
  ['release version is v2.30.17',build.includes("version:'2.30.17'")&&build.includes("shell:'v30-17'")&&sw.includes("signalforge-shell-v30-17")],
  ['summary remains explanatory only',summary.includes('/api/signals')&&!summary.includes('/api/market-data')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){console.error(`Stage 14.16 regression failed: ${failed.map(([name])=>name).join(', ')}`);process.exit(1);}
console.log('Stage 14.16 mobile decision-first regression passed.');
