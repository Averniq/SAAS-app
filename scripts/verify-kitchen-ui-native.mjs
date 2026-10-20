import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { jobEvidence } from './kitchen-print-fault-fixture.mjs';

const fixture = JSON.parse(await readFile('.local-print/mainline-e2e-fixture.json', 'utf8'));
const beforePath = '.local-print/e2e-order-before.json';
const after = jobEvidence(fixture);
if (process.argv.includes('--before')) {
  assert.equal(after.state, 'queued');
  assert.equal(after.attemptCount, 0);
  await writeFile(beforePath, JSON.stringify(after));
  console.log('PASS captured pre-native fingerprint for the exact UI-created queued job');
} else {
  const before = JSON.parse(await readFile(beforePath, 'utf8'));
  assert.equal(after.state, 'transmitted');
  assert.equal(after.attemptCount, 1);
  assert.equal(after.attemptRows, 1);
  for (const key of ['orderStatus', 'paidAt', 'orderFingerprint', 'itemsFingerprint', 'paymentsFingerprint']) {
    assert.equal(after[key], before[key], key);
  }
  const captures = [];
  const marker = Buffer.from('ORDER #' + fixture.orderNumber + '\n');
  for (const filename of await readdir('.local-print/captures')) {
    const bytes = await readFile('.local-print/captures/' + filename);
    if (bytes.includes(marker)) captures.push({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  assert.equal(captures.length, 1, 'Exactly one TCP stream for this UI-created order');
  const evidencePath = 'docs/evidence/kitchen-printing-mainline/full-app-e2e.json';
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  evidence.nativeDelivery = {
    result: 'PASS', sameUiCreatedOrder: true, nativeAttemptCount: after.attemptCount,
    uniqueAttemptIds: after.attemptRows, tcpStreams: captures.length, captures,
    state: after.state, paperOutput: 'NOT CONFIRMED', unchangedOrderItemsAndPayments: true,
    standardApkSha256: createHash('sha256').update(await readFile('android/app/build/outputs/apk/debug/app-debug.apk')).digest('hex'),
  };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS exact UI-created job consumed by native Android worker once; one TCP stream; order/items/payments unchanged');
}
