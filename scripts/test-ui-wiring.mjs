import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('public/index.html');
const router=read('public/ui-router.js');
const pwa=read('public/pwa.js');
const screener=read('public/screener-ui.js');
const app=read('public/app.js');
const sw=read('public/service-worker.js');

const checks=[
  ['Dashboard nav exists',html.includes('id="dashboardNavBtn"')],
  ['Screener nav exists',html.includes('id="screenerNavBtn"')],
  ['Scanner refresh exists',html.includes('id="scanBtn"')],
  ['Load symbol button exists',html.includes('id="loadSymbolBtn"')],
  ['UI router is loaded',html.includes('<script src="ui-router.js"></script>')],
  ['Scanner refresh is wired',router.includes("closest?.('#scanBtn')")&&router.includes('/api/opportunity-radar')&&router.includes('/api/signals')],
  ['Dashboard reconciliation exists',router.includes('function showDashboard()')],
  ['Screener route is centralized',router.includes("document.getElementById('smartScreenerView')")],
  ['Simulation route is centralized',router.includes("document.getElementById('simulationView')")],
  ['Portfolio route is centralized',router.includes("document.querySelector('.portfolio-panel')")],
  ['Alerts route is centralized',router.includes("document.getElementById('alertHistoryPanel')")],
  ['Dynamic Portfolio module loads',pwa.includes("loadModuleScript('/portfolio-ui.js'")],
  ['Dynamic Alerts module loads',pwa.includes("loadModuleScript('/alert-history.js'")],
  ['Dynamic Radar module loads',pwa.includes("loadModuleScript('/radar-ui.js'")],
  ['Screener refresh handler exists',screener.includes("sfScreenRefresh')")&&screener.includes('loadScreener')],
  ['Simulation refresh handler exists',screener.includes("sfSimRefresh')")&&screener.includes('loadSimulation')],
  ['Load symbol handler exists',app.includes("$('loadSymbolBtn').addEventListener('click'")],
  ['Timeframe buttons are wired',app.includes("b.addEventListener('click'")&&app.includes('state.timeframe=tf')],
  ['New router is cached',sw.includes("'/ui-router.js'")],
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){console.error(`\n${failed.length} UI wiring check(s) failed.`);process.exit(1);}
console.log(`\n${checks.length} UI wiring checks passed.`);
