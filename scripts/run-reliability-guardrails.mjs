import { spawnSync } from 'node:child_process';

// Compatibility entry point retained for existing tooling and historical references.
// The production-critical test list is owned only by scripts/test-manifest.mjs.
const result=spawnSync(process.execPath,['scripts/run-test-suite.mjs','reliability'],{stdio:'inherit'});
process.exit(result.status??1);
