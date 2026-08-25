import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('public/pwa.css');
const sw = read('public/service-worker.js');
const build = read('public/build-info.js');

const must = (value, needle, label) => {
  if (!value.includes(needle)) throw new Error(`${label}: missing ${needle}`);
};

must(css, 'body.sf-simple-mode #sfUnifiedSelected', 'Simple mode hides duplicate unified action');
must(css, 'body.sf-simple-mode #sfTelemetryPanel', 'Simple mode hides backend/system proof panel');
must(css, '.main-content{min-width:0;order:1', 'Mobile decision content remains before watchlist');
must(css, '.sidebar{position:static;order:2', 'Mobile watchlist remains after decision content');
if(!/signalforge-shell-v30-\d+/.test(sw))throw new Error('Service-worker must retain a versioned v30 shell');
must(sw, '.then(()=>self.skipWaiting())', 'Newest shell auto-activates after install');
if(!/version:'2\.30\.\d+'/.test(build))throw new Error('Visible build must remain SignalForge 2.30.x');
if(!/shell:'v30-\d+'/.test(build))throw new Error('Visible shell must remain versioned');

console.log('Stage 14.17 mobile simple-mode shell regression: PASS');
