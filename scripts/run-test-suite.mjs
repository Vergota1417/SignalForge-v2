import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_TESTS, HISTORICAL_DISABLED_TESTS, PRODUCTION_GUARDRAIL_TESTS, SYNTAX_ROOTS, TEST_GROUPS } from './suite-manifest.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=String(process.argv[2]||'all').toLowerCase();

function rel(full){return path.relative(ROOT,full).split(path.sep).join('/');}
function walk(dir){
  if(!fs.existsSync(dir))return[];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function validateManifest(){
  const groups=[...BASELINE_TESTS,...PRODUCTION_GUARDRAIL_TESTS,...HISTORICAL_DISABLED_TESTS];
  const counts=new Map();
  for(const file of groups)counts.set(file,(counts.get(file)||0)+1);
  const duplicates=[...counts.entries()].filter(([,count])=>count!==1).map(([file])=>file);
  if(duplicates.length)throw new Error(`Test manifest contains duplicate classifications: ${duplicates.join(', ')}`);
  for(const file of groups){
    if(!fs.existsSync(path.join(ROOT,file)))throw new Error(`Manifest references missing test: ${file}`);
  }
  const discovered=walk(path.join(ROOT,'scripts'))
    .map(rel)
    .filter(file=>/^scripts\/test-.*\.mjs$/.test(file))
    .sort();
  const classified=[...counts.keys()].sort();
  const orphaned=discovered.filter(file=>!counts.has(file));
  const stale=classified.filter(file=>!discovered.includes(file));
  if(orphaned.length)throw new Error(`Unclassified test files: ${orphaned.join(', ')}`);
  if(stale.length)throw new Error(`Manifest entries are not test files: ${stale.join(', ')}`);
  console.log(`Test manifest valid: ${BASELINE_TESTS.length} baseline, ${PRODUCTION_GUARDRAIL_TESTS.length} production-critical, ${HISTORICAL_DISABLED_TESTS.length} historical/disabled.`);
}

function syntaxFiles(){
  const extensions=new Set(['.js','.mjs']);
  return SYNTAX_ROOTS.flatMap(root=>walk(path.join(ROOT,root)))
    .filter(full=>extensions.has(path.extname(full)))
    .map(rel)
    .sort();
}

function runNode(args,label){
  const result=spawnSync(process.execPath,args,{cwd:ROOT,stdio:'inherit'});
  if(result.status!==0)throw new Error(`${label} failed with exit code ${result.status??'unknown'}`);
}

function runSyntax(){
  const files=syntaxFiles();
  if(!files.length)throw new Error('No JavaScript files discovered for syntax checking.');
  for(const file of files)runNode(['--check',file],`Syntax check: ${file}`);
  console.log(`Syntax checks passed (${files.length} discovered JavaScript files).`);
}

function runGroup(name){
  const tests=TEST_GROUPS[name];
  if(!tests)throw new Error(`Unknown test group: ${name}`);
  for(const file of tests)runNode([file],`${name} test: ${file}`);
  console.log(`${name} tests passed (${tests.length}).`);
}

try{
  validateManifest();
  if(mode==='manifest')process.exit(0);
  if(mode==='syntax'){runSyntax();process.exit(0);}
  if(mode==='baseline'){runGroup('baseline');process.exit(0);}
  if(mode==='reliability'){runGroup('reliability');process.exit(0);}
  if(mode==='historical'){runGroup('historical');process.exit(0);}
  if(mode==='all'){
    runSyntax();
    runGroup('baseline');
    runGroup('reliability');
    process.exit(0);
  }
  throw new Error(`Unknown mode "${mode}". Use all, manifest, syntax, baseline, reliability, or historical.`);
}catch(error){
  console.error(error?.stack||error?.message||String(error));
  process.exit(1);
}
