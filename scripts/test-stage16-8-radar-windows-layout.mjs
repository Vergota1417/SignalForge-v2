import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const radar=read('../public/radar-ui.js');
const css=read('../public/radar.css');
const build=read('../public/build-info.js');
const sw=read('../public/service-worker.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(radar,/grid-template-columns:minmax\(0,1fr\)!important/,'desktop sidebar Radar must stack card content instead of using a cramped three-column row');
assert.match(radar,/radar-card-head/,'desktop Radar must have an explicit card header');
assert.match(radar,/radar-unified-meta[^`]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,'readiness, gates and RVOL must use a stable three-cell metric grid');
assert.match(radar,/radar-card-foot/,'research timing and discovery velocity must have their own footer area');
assert.match(radar,/radar-eta span\{white-space:normal;overflow-wrap:anywhere\}/,'long research timing must wrap instead of forcing horizontal compression');
assert.match(radar,/name\.toUpperCase\(\)!==String\(r\.symbol\|\|''\)\.toUpperCase\(\)/,'ticker-only provider names must not render as duplicate symbol labels');
assert.match(radar,/\.sf-action-flow\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,'unified action flow must wrap into compact desktop-safe cells');
assert.match(radar,/@media\(max-width:760px\)[\s\S]*?\.radar-block\{display:none!important\}/,'phone behavior must continue hiding the duplicate sidebar Radar');
assert.match(css,/grid-template-columns:minmax\(0,1fr\)/,'external Radar CSS must agree with the stacked desktop card contract');
assert.match(css,/overflow-wrap:anywhere/,'external Radar CSS must permit long labels to wrap safely under Windows scaling');
assert.equal(pkg.version,'2.30.47');
assert.match(build,/version:'2\.30\.47'/);
assert.match(build,/release:'radar-windows-layout'/);
assert.match(build,/shell:'v30-47'/);
assert.match(sw,/signalforge-shell-v30-47/,'PWA shell must invalidate the old compressed Radar layout');
assert.match(sw,/signalforge-api-snapshots-v10/,'UI-only Stage 16.8 must not unnecessarily invalidate API snapshots');

console.log('Stage 16.8 Windows Opportunity Radar layout regression: PASS');
