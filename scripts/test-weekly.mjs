import assert from 'node:assert/strict';
import { investmentWeekKey } from '../src/weekly.js';

assert.equal(investmentWeekKey(new Date('2026-08-21T18:00:00Z')),'2026-08-17');
assert.equal(investmentWeekKey(new Date('2026-08-17T15:00:00Z')),'2026-08-17');
assert.equal(investmentWeekKey(new Date('2026-08-23T15:00:00Z')),'2026-08-17');
assert.equal(investmentWeekKey(new Date('2026-08-24T15:00:00Z')),'2026-08-24');
console.log('weekly engine tests passed');
