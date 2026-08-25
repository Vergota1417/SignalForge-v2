import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// This list is intentionally limited to behavior that is active in production.
// Historical tests for disabled features remain in scripts/ for reference, but they
// must not force CI to re-enable a quarantined subsystem.
const tests=[
  'scripts/test-stage14-28-detection-latency-audit.mjs',
  'scripts/test-stage14-29-chart-control-reliability.mjs',
  'scripts/test-stage14-33-resource-usage-reduction.mjs',
  'scripts/test-stage14-35-emergency-request-guard.mjs',
  'scripts/test-stage14-36-disable-pattern-network-layer.mjs',
  'scripts/test-stage14-37-hard-guardrails.mjs',
  'scripts/test-stage14-38-repository-hygiene.mjs',
  'scripts/test-stage14-39-central-production-policy.mjs'
];

for(const file of tests){
  if(!fs.existsSync(file)){
    console.error(`Required production reliability guardrail test is missing: ${file}`);
    process.exit(1);
  }
  const result=spawnSync(process.execPath,[file],{stdio:'inherit'});
  if(result.status!==0){
    console.error(`Production reliability guardrail failed: ${file}`);
    process.exit(result.status||1);
  }
}

console.log(`Production reliability guardrails passed (${tests.length} active stages).`);
