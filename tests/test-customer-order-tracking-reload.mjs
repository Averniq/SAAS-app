import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
assert.match(app, /function persistPublicOrderTracking\(/, 'canonical customer tracking must persist after confirmation');
assert.match(app, /function restorePublicOrderTracking\(/, 'canonical customer tracking must restore after reload');
assert.match(app, /restorePublicOrderTracking\(\);/, 'public startup must restore persisted tracking');
assert.match(app, /cloudId: order\.cloudId/, 'tracking stores the non-privileged public order id');
assert.doesNotMatch(app.slice(app.indexOf('function persistPublicOrderTracking('), app.indexOf('function restorePublicOrderTracking(')), /access_token|password|staffUser/, 'tracking must not persist staff credentials');
console.log('Customer order tracking reload contract: PASS');
