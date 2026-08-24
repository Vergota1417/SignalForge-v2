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
must(sw, "signalforge-shell-v30-18", 'Service-worker shell version');
must(sw, '.then(()=>self.skipWaiting())', 'Newest shell auto-activates after install');
must(build, "version:'2.30.18'", 'Visible build version');
must(build, "shell:'v30-18'", 'Visible shell version');

console.log('Stage 14.17 mobile simple-mode shell regression: PASS');
