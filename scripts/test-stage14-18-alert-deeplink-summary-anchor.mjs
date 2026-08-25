import fs from 'node:fs';
import assert from 'node:assert/strict';

const summary=fs.readFileSync('public/decision-summary-ui.js','utf8');
const push=fs.readFileSync('src/push.js','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');
const build=fs.readFileSync('public/build-info.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.match(summary,/main\.insertBefore\(panel,main\.firstElementChild\|\|null\)/,'Decision Summary must anchor directly to main content');
assert.doesNotMatch(summary,/hero\.insertAdjacentElement\('afterend',panel\)/,'Decision Summary must not depend on hero-card insertion timing');
assert.match(summary,/data-alert-context/,'Decision Summary must render opened-from-alert context');
assert.match(summary,/data-details-toggle>Show Details/,'Decision Summary must always provide Show Details');
assert.match(summary,/alertSymbol/,'Alert context must validate the ticker opened from the notification');
assert.match(push,/buildAlertUrl/,'Push payloads must build deep links');
assert.match(push,/alertStatus/,'Push deep links must preserve alert status');
assert.match(push,/alertReason/,'Push deep links must preserve alert reason');
assert.match(push,/alertPrevious/,'Push deep links must preserve previous state');
assert.match(sw,/signalforge-shell-v30-\d+/,'Service worker must retain a versioned v30 shell');
assert.match(sw,/targetUrl\.searchParams\.set\('symbol'/,'Notification click must recover a missing symbol deep link');
assert.match(sw,/targetUrl\.searchParams\.set\('alert'/,'Notification click must recover alert context when needed');
assert.match(build,/version:'2\.30\.\d+'/,'Visible build must remain SignalForge 2.30.x');
assert.match(pkg.version,/^2\.30\.\d+$/,'Package metadata must remain a SignalForge 2.30.x version');

console.log('Stage 14.18 alert deep-link + summary anchor checks passed.');
