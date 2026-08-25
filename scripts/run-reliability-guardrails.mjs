import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const tests=[
  'scripts/test-stage14-28-detection-latency-audit.mjs',
  'scripts/test-stage14-29-chart-control-reliability.mjs',
  'scripts/test-stage14-30-pattern-overlay-controls.mjs',
  'scripts/test-stage14-31-live-pattern-context-bridge.mjs',
  'scripts/test-stage14-33-resource-usage-reduction.mjs',
  'scripts/test-stage14-35-emergency-request-guard.mjs',
  'scripts/test-stage14-36-disable-pattern-network-layer.mjs',
  'scripts/test-stage14-37-hard-guardrails.mjs'
];

for(const file of tests){
  if(!fs.existsSync(file)){
    console.error(`Required reliability guardrail test is missing: ${file}`);
    process.exit(1);
  }
  const result=spawnSync(process.execPath,[file],{stdio:'inherit'});
  if(result.status!==0){
    console.error(`Reliability guardrail failed: ${file}`);
    process.exit(result.status||1);
  }
}

console.log(`Reliability guardrails passed (${tests.length} stages).`);
