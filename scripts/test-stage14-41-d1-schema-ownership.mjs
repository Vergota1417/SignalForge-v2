import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSchema } from '../src/db.js';

function fakeDb({failFirst=false,delayMs=0}={}){
  let batchCalls=0;
  let shouldFail=failFirst;
  return{
    get batchCalls(){return batchCalls;},
    prepare(sql){return{sql};},
    async batch(statements){
      batchCalls++;
      assert.ok(Array.isArray(statements)&&statements.length>=1,'schema initialization should submit a statement batch');
      if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
      if(shouldFail){shouldFail=false;throw new Error('synthetic schema failure');}
      return statements.map(()=>({success:true}));
    }
  };
}

const shared=fakeDb({delayMs:5});
await Promise.all([
  ensureSchema({DB:shared}),
  ensureSchema({DB:shared}),
  ensureSchema({DB:shared}),
  ensureSchema({DB:shared})
]);
assert.equal(shared.batchCalls,1,'concurrent callers on one D1 binding must share one schema initialization');
await ensureSchema({DB:shared});
assert.equal(shared.batchCalls,1,'repeated warm-isolate callers must reuse completed schema initialization');

const independent=fakeDb();
await ensureSchema({DB:independent});
assert.equal(independent.batchCalls,1,'a different D1 binding must initialize independently');

const retrying=fakeDb({failFirst:true});
await assert.rejects(()=>ensureSchema({DB:retrying}),/synthetic schema failure/,'failed schema initialization must surface the error');
assert.equal(retrying.batchCalls,1,'failed initialization should run once for the failed attempt');
await ensureSchema({DB:retrying});
assert.equal(retrying.batchCalls,2,'failed initialization must clear ownership state so a later request can retry');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const srcDir=path.join(root,'src');
const schemaSql=/CREATE\s+(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS|ALTER\s+TABLE|PRAGMA\s+table_info/i;
const offenders=[];
for(const name of fs.readdirSync(srcDir).filter(name=>name.endsWith('.js'))){
  const full=path.join(srcDir,name),text=fs.readFileSync(full,'utf8');
  if(!schemaSql.test(text))continue;
  if(!/new\s+WeakMap\s*\(/.test(text))offenders.push(name);
  assert.match(text,/\.catch\([^)]*=>\{[^}]*\.delete\(/s,`${name} must clear its once-per-binding schema promise after initialization failure`);
}
assert.deepEqual(offenders,[],'every runtime schema/migration owner must use once-per-D1-binding ownership');

const activity=fs.readFileSync(path.join(srcDir,'activity-rhythm.js'),'utf8');
assert.match(activity,/async function ensureSchema\(env\)/,'Activity Rhythm shadow persistence must define its schema initializer instead of calling an undefined function');
assert.match(activity,/activitySchemaReadyByDb=new WeakMap\(\)/,'Activity Rhythm schema must be once-per-D1-binding');

const outcomes=fs.readFileSync(path.join(srcDir,'outcomes.js'),'utf8');
assert.match(outcomes,/outcomeSchemaReadyByDb=new WeakMap\(\)/,'outcome schema and migrations must be once-per-D1-binding');
assert.match(outcomes,/ALTER TABLE evidence_outcomes ADD COLUMN/,'outcome compatibility migrations must remain available on cold initialization');

const weekend=fs.readFileSync(path.join(srcDir,'weekend.js'),'utf8');
assert.match(weekend,/weekendSchemaReadyByDb=new WeakMap\(\)/,'weekend intelligence schema must not run on every report read');

console.log('Stage 14.41 D1 schema ownership regression checks passed.');
