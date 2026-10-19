import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Local port ${port} occupied or unavailable`)));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(resolve));
  });
}
export async function materializeKitchenCandidate(options) {
  const allowed = new Set(['destination', 'projectId', 'ports', 'candidateFiles']);
  if (!options || Object.keys(options).some(key => !allowed.has(key))) throw new Error('Local candidate only: remote/linked/endpoint overrides refused');
  const { destination, projectId, ports, candidateFiles = [] } = options;
  if (!/^aveniq-kitchen-[a-z0-9-]{5,60}$/.test(projectId ?? '')) throw new Error('Unique local kitchen project identity required');
  const workspace = path.resolve(destination ?? root);
  const relative = path.relative(root, workspace);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Destination must be a new directory inside this workspace');
  let parent = path.dirname(workspace);
  // Resolve existing ancestors so junctions cannot escape the isolated worktree.
  while (true) {
    try { const actual = await realpath(parent); const rel = path.relative(await realpath(root), actual); if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Destination escapes workspace'); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; parent = path.dirname(parent); }
  }
  if (await lstat(workspace).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Destination already exists; never overwritten');
  const names = ['api', 'db', 'shadow', 'studio', 'inbucket', 'analytics'];
  if (!ports || Object.keys(ports).length !== names.length || names.some(name => !Number.isInteger(ports[name]) || ports[name] < 1024 || ports[name] > 65535) || new Set(Object.values(ports)).size !== names.length) throw new Error('Six distinct explicit local ports required');
  await Promise.all(names.map(name => checkPort(ports[name])));
  if (!Array.isArray(candidateFiles) || new Set(candidateFiles).size !== candidateFiles.length) throw new Error('Explicit unique candidate list required');
  const validation = spawnSync(process.execPath, ['scripts/test-canonical-release-control.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (validation.status !== 0) throw new Error(`Invalid frozen canonical chain: ${validation.stderr || validation.stdout}`);
  const manifest = JSON.parse(await readFile(path.join(root, 'supabase/catalog-manifest.json'), 'utf8'));
  const contents = [];
  for (const entry of manifest.canonicalChain) {
    const text = await readFile(path.join(root, 'supabase/migrations', entry.filename), 'utf8');
    if (hash(text) !== entry.sha256) throw new Error('Canonical hash mismatch');
    contents.push({ filename: entry.filename, text });
  }
  const candidates = [];
  let previous = manifest.canonicalChain.at(-1).version;
  for (const filename of candidateFiles) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(filename) || filename.slice(0, 14) <= previous) throw new Error('Candidate must be an explicit append-only timestamped basename in version order');
    const candidateDirectory = path.join(root, 'supabase/kitchen-print-candidates');
    if ((await lstat(candidateDirectory)).isSymbolicLink() || (await realpath(candidateDirectory)).toLowerCase() !== path.join(await realpath(root), 'supabase/kitchen-print-candidates').toLowerCase()) throw new Error('Candidate directory junction escape refused');
    const file = path.join(candidateDirectory, filename);
    if ((await lstat(file)).isSymbolicLink()) throw new Error('Candidate symlinks refused');
    const text = await readFile(file, 'utf8');
    contents.push({ filename, text }); candidates.push({ filename, sha256: hash(text), status: 'local-candidate-not-release-approved' });
    previous = filename.slice(0, 14);
  }
  // A new config never inherits project links, secrets, hosted URLs or root stack ports.
  const config = `project_id = "${projectId}"\n[api]\nenabled = true\nport = ${ports.api}\nschemas = ["public", "graphql_public"]\nextra_search_path = ["public", "extensions"]\nmax_rows = 1000\n[db]\nport = ${ports.db}\nshadow_port = ${ports.shadow}\nmajor_version = 15\n[db.seed]\nenabled = false\n[studio]\nenabled = false\nport = ${ports.studio}\napi_url = "http://127.0.0.1"\n[inbucket]\nenabled = false\nport = ${ports.inbucket}\n[analytics]\nenabled = false\nport = ${ports.analytics}\n[auth]\nenabled = true\nsite_url = "http://127.0.0.1:4173"\nadditional_redirect_urls = []\njwt_expiry = 3600\nenable_signup = true\n[auth.email]\nenable_signup = true\nenable_confirmations = false\n`;
  // Nonrecursive exclusive mkdir is the ownership gate. No deletion or cleanup of unknown paths.
  await mkdir(path.dirname(workspace), { recursive: true });
  await mkdir(workspace);
  await mkdir(path.join(workspace, 'supabase/migrations'), { recursive: true });
  for (const entry of contents) await writeFile(path.join(workspace, 'supabase/migrations', entry.filename), entry.text, { flag: 'wx' });
  await writeFile(path.join(workspace, 'supabase/config.toml'), config, { flag: 'wx' });
  const result = { localOnly: true, projectId, ports, canonicalChain: manifest.canonicalChain, candidates };
  await writeFile(path.join(workspace, 'kitchen-local.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = await materializeKitchenCandidate(options);
  console.log(`Materialized ${result.canonicalChain.length} canonical + ${result.candidates.length} explicit candidate migrations for ${result.projectId}`);
}

