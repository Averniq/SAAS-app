import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { materializeKitchenCandidate } from '../../scripts/materialize-kitchen-print-candidate.mjs';
const root = path.resolve(import.meta.dirname, '../..');
async function freePorts() {
  const servers = await Promise.all(Array.from({ length: 6 }, async () => {
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return server;
  }));
  const values = servers.map(server => server.address().port);
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  return Object.fromEntries(['api','db','shadow','studio','inbucket','analytics'].map((name, i) => [name, values[i]]));
}
async function fixture(t) {
  const parent = await mkdtemp(path.join(root, '.kitchen-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { destination: path.join(parent, 'candidate'), projectId: 'aveniq-kitchen-test-123', ports: await freePorts(), candidateFiles: [] };
}
test('reject_existing_destination without deleting contents', async t => {
  const args = await fixture(t); await mkdir(args.destination);
  await writeFile(path.join(args.destination, 'sentinel'), 'keep');
  await assert.rejects(materializeKitchenCandidate(args), /exist/i);
  assert.equal(await readFile(path.join(args.destination, 'sentinel'), 'utf8'), 'keep');
});
test('reject_linked_or_remote_database and invalid project identity', async t => {
  const args = await fixture(t);
  for (const extra of [{ linked: true }, { databaseUrl: 'postgres://db.example.com/postgres' }, { apiUrl: 'https://example.com' }, { projectId: 'aveniq-saas' }]) {
    await assert.rejects(materializeKitchenCandidate({ ...args, ...extra }), /local|project|remote|linked/i);
  }
});
test('preserve_canonical_hashes and root config; append_only_explicit_candidates', async t => {
  const args = await fixture(t);
  const before = await readFile(path.join(root, 'supabase/config.toml'), 'utf8');
  const canonical = JSON.parse(await readFile(path.join(root, 'supabase/catalog-manifest.json'), 'utf8'));
  const result = await materializeKitchenCandidate(args);
  assert.deepEqual(result.canonicalChain, canonical.canonicalChain);
  assert.equal(result.canonicalChain.length, 22); assert.deepEqual(result.candidates, []);
  assert.equal((await readdir(path.join(args.destination, 'supabase/migrations'))).length, 22);
  assert.equal(await readFile(path.join(root, 'supabase/config.toml'), 'utf8'), before);
  const config = await readFile(path.join(args.destination, 'supabase/config.toml'), 'utf8');
  assert.match(config, /project_id = "aveniq-kitchen-test-123"/);
  assert.ok(config.includes('port = ' + args.ports.db));
  assert.equal(JSON.parse(await readFile(path.join(args.destination, 'kitchen-local.json'), 'utf8')).localOnly, true);
});
test('reject_occupied_ports without creating destination', async t => {
  const args = await fixture(t); const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(materializeKitchenCandidate({ ...args, ports: { ...args.ports, api: server.address().port } }), /occupied|in use/i);
  await assert.rejects(readFile(path.join(args.destination, 'kitchen-local.json')), /ENOENT/);
});
test('reject duplicate ports, root destination and candidate traversal', async t => {
  const args = await fixture(t);
  await assert.rejects(materializeKitchenCandidate({ ...args, ports: { ...args.ports, db: args.ports.api } }), /port/i);
  await assert.rejects(materializeKitchenCandidate({ ...args, destination: root }), /destination|workspace/i);
  await assert.rejects(materializeKitchenCandidate({ ...args, candidateFiles: ['../migrations/001_initial_schema.sql'] }), /candidate/i);
});


test('reject candidate directory junction escape', async t => {
  const args = await fixture(t);
  const directory = path.join(root, 'supabase/kitchen-print-candidates');
  await symlink(path.dirname(args.destination), directory, 'junction');
  t.after(() => rm(directory));
  await writeFile(path.join(path.dirname(args.destination), '20990101000000_escape.sql'), 'select 1;');
  await assert.rejects(materializeKitchenCandidate({ ...args, candidateFiles: ['20990101000000_escape.sql'] }), /candidate.*(junction|escape|symlink)|outside/i);
});
test('append only named candidates and preserve exact content hashes', async t => {
  const args = await fixture(t);
  const directory = path.join(root, 'supabase/kitchen-print-candidates');
  await mkdir(directory); t.after(() => rm(directory, { recursive: true }));
  const name = '20990101000000_fixture.sql';
  await writeFile(path.join(directory, name), 'select 1;\n');
  await writeFile(path.join(directory, '20990101000001_omitted.sql'), 'select 2;\n');
  const result = await materializeKitchenCandidate({ ...args, candidateFiles: [name] });
  assert.deepEqual(result.candidates, [{ filename: name, sha256: '4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c', status: 'local-candidate-not-release-approved' }]);
  assert.equal((await readdir(path.join(args.destination, 'supabase/migrations'))).length, 23);
  assert.equal(await readFile(path.join(args.destination, 'supabase/migrations', name), 'utf8'), 'select 1;\n');
  for (const entry of result.canonicalChain) {
    const text = await readFile(path.join(args.destination, 'supabase/migrations', entry.filename), 'utf8');
    assert.equal(createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex'), entry.sha256);
  }
  const next = { ...args, destination: path.join(path.dirname(args.destination), 'next') };
  await assert.rejects(materializeKitchenCandidate({ ...next, candidateFiles: [name, name] }), /unique/i);
  await assert.rejects(materializeKitchenCandidate({ ...next, candidateFiles: ['20990101000001_omitted.sql', name] }), /append-only/i);
});

