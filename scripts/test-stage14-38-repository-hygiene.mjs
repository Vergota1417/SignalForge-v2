import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const ledger=fs.readFileSync(new URL('../SIGNALFORGE_BUILD_LEDGER.md',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(wrangler,/"directory": "\.\/public"/,'Cloudflare production assets must come only from ./public');
for(const file of ['index.html','app.js','styles.css','config.js']){
  assert.equal(fs.existsSync(new URL(`../${file}`,import.meta.url)),false,`legacy root frontend duplicate must stay removed: ${file}`);
  assert.equal(fs.existsSync(new URL(`../public/${file}`,import.meta.url)),true,`production frontend file must remain under public/: ${file}`);
}
assert.match(ledger,/Historical Chronology/,'Build Ledger must identify itself as historical chronology');
assert.match(ledger,/not the current architecture authority/,'Build Ledger must defer current architecture ownership to README');
assert.doesNotMatch(ledger,/^## CURRENT$/m,'Build Ledger must not recreate a stale CURRENT section');
assert.match(build,new RegExp(`version:'${pkg.version.replaceAll('.','\\.')}'`),'package version and visible runtime version must stay aligned');

console.log('Stage 14.38 repository hygiene regression passed.');
