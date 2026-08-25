import assert from 'node:assert/strict';
import { earlyMovementSignal } from '../src/early-movement.js';
import { radarEvidenceRow } from '../src/evidence.js';

const building=earlyMovementSignal({scoreVelocity:12,relativeVolume:1.8,changePct:2.4,rollingDiscoveryScore:65});
assert.equal(building.state,'EARLY MOVEMENT — BUILDING');
assert.ok(building.acceleration>=72);assert.ok(building.confirmations>=3);
assert.match(building.action,/WATCH CLOSELY/);

const watch=earlyMovementSignal({scoreVelocity:5,relativeVolume:1.25,changePct:.2,rollingDiscoveryScore:24});
assert.equal(watch.state,'MOVEMENT WATCH');
assert.ok(watch.acceleration>=50);

const quiet=earlyMovementSignal({scoreVelocity:-2,relativeVolume:.8,changePct:-1.2,rollingDiscoveryScore:10});
assert.equal(quiet.state,'QUIET');assert.equal(quiet.action,'NO EARLY ACTION');

const extended=earlyMovementSignal({scoreVelocity:7,relativeVolume:1.4,changePct:10,rollingDiscoveryScore:45});
assert.ok(extended.acceleration<building.acceleration,'overextended move should not outrank a healthy developing move');

const evidence=radarEvidenceRow({symbol:'NVDA',price:125,changePct:2.4,rollingDiscoveryScore:65,scoreVelocity:12,relativeVolume:1.8,dollarVolume:25_000_000,earlyMovement:building},{now:1_800_000});
assert.equal(evidence.modelVersion,'sf-early-movement-v1');assert.equal(evidence.status,'EARLY MOVEMENT — BUILDING');assert.equal(evidence.payload.earlyMovement.acceleration,building.acceleration);assert.deepEqual(evidence.payload.earlyMovement.reasons,building.reasons);

console.log('Stage 13 early movement regression checks passed.');
