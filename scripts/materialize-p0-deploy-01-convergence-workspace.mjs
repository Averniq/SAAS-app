#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFixtureSql } from './build-p0-deploy-01-production-prestate-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canonicalEvidenceDir = resolve(root, 'evidence');
const cliProgram = 'C:/Users/WindVeil/AppData/Local/aveniq-tools/supabase-cli/node_modules/supabase/dist/supabase.js';
const expectedAuthUid = '7c1ff2ecbe653c9358b3115a2607db9573f88a2944ae4eca9e296a89cc5186a7';
export const localPg17ServiceExclusions = ['gotrue','realtime','storage-api','imgproxy','kong','mailpit','postgrest','postgres-meta','studio','edge-runtime','logflare','supavisor','vector'];
export const requiredTask4BaselineSql = () => "DO $$ BEGIN IF to_regclass('public.restaurants') IS NULL OR to_regclass('public.orders') IS NULL OR to_regclass('public.tables') IS NULL THEN RAISE EXCEPTION 'C3 baseline relation materialization failed'; END IF; END $$;\n";
const run = (args, cwd, env) => { const result = spawnSync(process.execPath, [cliProgram, ...args], { cwd, env, encoding: 'utf8', shell: false }); if (result.status !== 0) throw new Error(`pinned Supabase CLI failed: ${args.join(' ')}\n${result.stdout || ''}\n${result.stderr || result.error?.message || ''}`); return result.stdout; };
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(SUPABASE|POSTGRES|PG|DATABASE_URL|GOTRUE|ANON_KEY|SERVICE_ROLE)/i.test(key)));
const fail = message => { throw new Error(`P0-DEPLOY-01 materializer refusal: ${message}`); };
const overlaySql = resolve(canonicalEvidenceDir, 'p0-deploy-01-auth-users-parent-index-fixture-overlay.sql');
const overlaySidecar = `${overlaySql}.sha256`;
const sha256 = text => createHash('sha256').update(text).digest('hex');
const pathFrom = value => value instanceof URL ? fileURLToPath(value) : value;

// Split only at top-level semicolons. The canonical overlay's DO blocks contain
// internal semicolons, while the pinned local CLI accepts one top-level statement.
export function splitCanonicalOverlayStatements(sql) {
  const statements = []; let start = 0; let quote = null; let dollar = null; let lineComment = false; let blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    if (lineComment) { if (sql[i] === '\n') lineComment = false; continue; }
    if (blockComment) { if (sql.startsWith('*/', i)) { i += 1; blockComment = false; } continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    const c = sql[i];
    if (quote) { if (c === quote && sql[i - 1] !== '\\') quote = null; continue; }
    if (sql.startsWith('--', i)) { lineComment = true; i += 1; continue; }
    if (sql.startsWith('/*', i)) { blockComment = true; i += 1; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '$') { const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/); if (match) { dollar = match[0]; i += dollar.length - 1; continue; } }
    if (c === ';') { const statement = sql.slice(start, i + 1).trim(); if (statement) statements.push(statement); start = i + 1; }
  }
  if (sql.slice(start).trim()) fail('canonical auth.users overlay has an unterminated statement');
  return statements;
}

export function deriveAuthUsersOverlayAuthority({ overlay = overlaySql, provenance = resolve(canonicalEvidenceDir, 'p0-deploy-01-auth-users-parent-index-fixture-overlay.provenance.json'), raw = resolve(canonicalEvidenceDir, 'c3-fk-parent-contracts.raw.json') } = {}) {
  const overlayPath = pathFrom(overlay); const provenancePath = pathFrom(provenance); const rawPath = pathFrom(raw);
  if (!existsSync(overlayPath) || !existsSync(provenancePath) || !existsSync(rawPath) || !existsSync(overlaySidecar)) fail('missing auth.users fixture overlay authority artifacts');
  const source = readFileSync(overlayPath, 'utf8'); const sourceHash = sha256(source);
  const provenanceData = JSON.parse(readFileSync(provenancePath, 'utf8'));
  const rawText = readFileSync(rawPath, 'utf8'); const rawSha256 = sha256(rawText);
  if (provenanceData.approved_raw_parent_authority?.sha256 !== rawSha256) fail(`approved raw C3 auth.users authority hash mismatch: ${rawSha256}`);
  if (provenanceData.overlay_sql?.sha256 !== sourceHash || readFileSync(overlaySidecar, 'utf8').trim().split(/\s+/)[0] !== sourceHash) fail(`auth.users fixture overlay hash mismatch: ${sourceHash}`);
  const rawEnvelope = JSON.parse(rawText); const records = JSON.parse(rawEnvelope.text);
  const users = records.map(record => record.contract).find(contract => contract?.schema === 'auth' && contract?.name === 'users');
  const definitions = provenanceData.definitions;
  if (!users || !Array.isArray(users.indexes) || !Array.isArray(definitions) || definitions.length !== 4 || !definitions.every(definition => users.indexes.includes(definition))) fail('approved raw C3 auth.users index definitions do not match overlay provenance');
  const preOverlayCount = provenanceData.expected_counts?.pre_overlay; const postOverlayCount = provenanceData.expected_counts?.post_overlay;
  if (preOverlayCount !== 11 || postOverlayCount !== 15 || postOverlayCount - preOverlayCount !== definitions.length) fail(`invalid evidence-derived auth.users parity: ${preOverlayCount}/${postOverlayCount}`);
  const preOverlayDefinitions = users.indexes.filter(definition => !definitions.includes(definition));
  const postOverlayDefinitions = [...users.indexes];
  if (preOverlayDefinitions.length !== preOverlayCount || postOverlayDefinitions.length !== postOverlayCount || new Set(postOverlayDefinitions).size !== postOverlayDefinitions.length) fail('approved raw C3 auth.users exact index-definition authority does not resolve to 11 pre-overlay and 15 post-overlay indexes');
  return { source, overlaySha256: sourceHash, rawSha256, definitions, preOverlayDefinitions, postOverlayDefinitions, preOverlayCount, postOverlayCount };
}

export function buildAuthUsersIndexDefinitionAssertion({ phase, definitions }) {
  if (!['pre', 'post'].includes(phase) || !Array.isArray(definitions) || definitions.length === 0) fail('invalid exact auth.users index-definition assertion input');
  const expected = definitions.map(definition => `'${definition.replace(/'/g, "''")}'`).join(', ');
  return `DO $auth_users_index_parity$\nDECLARE observed text[]; expected text[] := ARRAY[${expected}];\nBEGIN\n  SELECT array_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) INTO observed FROM pg_catalog.pg_index i WHERE i.indrelid='auth.users'::regclass;\n  SELECT array_agg(definition ORDER BY definition) INTO expected FROM unnest(expected) AS definition;\n  IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'auth.users exact ${phase}-overlay index definitions mismatch'; END IF;\n  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='auth.users'::regclass AND conname='users_pkey' AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)' AND NOT condeferrable AND NOT condeferred) OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='auth.users'::regclass AND conname='users_phone_key' AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (phone)' AND NOT condeferrable AND NOT condeferred) THEN RAISE EXCEPTION 'auth.users ${phase}-overlay key constraints mismatch'; END IF;\nEND $auth_users_index_parity$;\n`;
}

function applyAuthUsersFixtureOverlay(workspace, env, portBase, afterOverlayStatement) {
  const authority = deriveAuthUsersOverlayAuthority();
  const statements = splitCanonicalOverlayStatements(authority.source);
  if (statements.length !== 6) fail(`canonical auth.users overlay must split into six statements, got ${statements.length}`);
  const expectedPre = `n <> ${authority.preOverlayCount}`; const expectedPost = `n <> ${authority.postOverlayCount}`;
  if (!statements[0].includes(expectedPre) || !statements[5].includes(expectedPost) || statements.slice(1, 5).map(statement => statement.replace(/;$/, '').trim()).join('\n') !== authority.definitions.join('\n')) fail('canonical auth.users overlay is not exact 11/11 and 15/15 parity from approved raw C3 evidence');
  const runAssertion = (phase, definitions) => {
    const assertion = resolve(workspace, `fixture-overlay-auth-users-${phase}-exact-index-definitions.sql`);
    writeFileSync(assertion, buildAuthUsersIndexDefinitionAssertion({ phase, definitions }), 'utf8');
    run(['db', 'query', '--local', '--workdir', workspace, '--file', assertion], root, env);
  };
  // Exact definitions come from the approved raw C3 envelope. Count/name
  // conditions in the canonical overlay are retained but are not sufficient.
  runAssertion('pre', authority.preOverlayDefinitions);
  // The pinned --local query connection cannot create indexes owned by
  // supabase_auth_admin. Use its local loopback CLI login so canonical source
  // text stays unchanged and every call remains local-only.
  const dbUrl = `postgresql://supabase_auth_admin:postgres@127.0.0.1:${portBase + 2}/postgres?sslmode=disable`;
  statements.forEach((statement, index) => {
    const localStatement = resolve(workspace, `fixture-overlay-auth-users-parent-indexes-${index + 1}.sql`);
    writeFileSync(localStatement, `${statement}\n`, 'utf8');
    run(['db', 'query', '--db-url', dbUrl, '--file', localStatement], root, env);
    afterOverlayStatement?.({ step: index + 1, statement, workspace, portBase });
  });
  runAssertion('post', authority.postOverlayDefinitions);
}

function configFor(id, portBase) { return `project_id = "${id}"\n\n[api]\nport = ${portBase + 1}\n\n[db]\nport = ${portBase + 2}\nshadow_port = ${portBase}\nmajor_version = 17\n\n[studio]\nport = ${portBase + 3}\n\n[local_smtp]\nport = ${portBase + 4}\n\n[analytics]\nport = ${portBase + 7}\n\n[auth]\nenabled = true\n`; }
function assertUnlinked(workspace) { if (existsSync(resolve(workspace, 'supabase/.temp/project-ref')) || existsSync(resolve(workspace, '.supabase'))) fail('fresh workspace contains hosted link metadata'); }
const configuredPorts = portBase => [portBase, portBase + 1, portBase + 2, portBase + 3, portBase + 4, portBase + 7];

export function parseWindowsExcludedTcpPorts(output) {
  const ports = new Set();
  for (const match of output.matchAll(/^\s*(\d+)\s+(\d+)\s*(?:\*.*)?$/gm)) {
    const start = Number(match[1]); const end = Number(match[2]);
    for (let port = start; port <= end; port += 1) ports.add(port);
  }
  return ports;
}

function windowsExcludedTcpPorts() {
  if (process.platform !== 'win32') return new Set();
  const result = spawnSync('netsh.exe', ['int', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], { encoding: 'utf8', shell: false });
  if (result.status !== 0) fail(`cannot inspect Windows TCP excluded-port ranges: ${result.stderr || result.error?.message || ''}`);
  return parseWindowsExcludedTcpPorts(result.stdout);
}

export function probeTcpPortAvailable(port, { host = '127.0.0.1', timeoutMs = 250 } = {}) {
  // This deliberately does not bind. A successful loopback TCP connect proves
  // another listener owns the port; ECONNREFUSED is the only free result.
  return new Promise((resolveProbe, rejectProbe) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => { socket.destroy(); rejectProbe(new Error(`TCP port probe timed out for ${host}:${port}`)); }, timeoutMs);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolveProbe(false); });
    socket.once('error', error => { clearTimeout(timer); if (error.code === 'ECONNREFUSED') resolveProbe(true); else rejectProbe(new Error(`TCP port probe failed for ${host}:${port}: ${error.code || error.message}`)); });
  });
}

export async function portsAreFree(ports) {
  const excluded = windowsExcludedTcpPorts();
  if (ports.some(port => excluded.has(port))) return false;
  return (await Promise.all(ports.map(port => probeTcpPortAvailable(port)))).every(Boolean);
}

async function findFreePortBase() {
  const start = 62000 + (parseInt(randomBytes(2).toString('hex'), 16) % 700);
  for (let offset = 0; offset < 700; offset += 1) {
    const portBase = 62000 + ((start - 62000 + offset) % 700);
    if (await portsAreFree(configuredPorts(portBase))) return portBase;
  }
  fail('no free configured local-stack port set is available in 62000-62706');
}

function cleanupProject(projectId, env) {
  // A failed start may make `supabase stop` nonzero; container absence, not that
  // CLI diagnostic, is the invariant. Never target another generated project.
  try { run(['stop', '--project-id', projectId, '--no-backup'], root, env); } catch {}
  const inspected = spawnSync('docker', ['ps', '-aq', '--filter', `name=${projectId}`], { encoding: 'utf8', shell: false });
  if (inspected.status !== 0) fail(`cannot verify cleanup for ${projectId}: ${inspected.stderr || inspected.error?.message || ''}`);
  if (inspected.stdout.trim()) fail(`orphan CLI-managed local containers remain for ${projectId}: ${inspected.stdout.trim()}`);
}

export async function materialize({ workspace, sourceEvidenceDir = canonicalEvidenceDir, prepareEvidence, afterOverlayStatement, projectId = `p0-deploy-01-task1-${randomBytes(6).toString('hex')}` } = {}) {
  if (!workspace || existsSync(workspace)) fail('workspace must be a new, nonexistent directory');
  if (/[&|<>^]/.test(workspace)) fail('workspace path contains a Windows shell metacharacter');
  if (!existsSync(cliProgram)) fail(`pinned CLI is unavailable at ${cliProgram}`);
  const hostile = Object.keys(process.env).filter(key => /^(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_PROJECT_REF|DATABASE_URL)$/i.test(key));
  if (hostile.length) fail(`hosted credential/link environment variables are present: ${hostile.join(', ')}`);
  const env = cleanEnv();
  let attemptCreated = false;
  try {
    mkdirSync(workspace, { recursive: true }); attemptCreated = true;
    if (prepareEvidence) {
      const workspaceEvidence = resolve(workspace, 'evidence');
      cpSync(sourceEvidenceDir, workspaceEvidence, { recursive: true });
      prepareEvidence(workspaceEvidence);
      sourceEvidenceDir = workspaceEvidence;
    }
    run(['init', '--workdir', workspace, '--yes'], root, env);
    const portBase = await findFreePortBase();
    writeFileSync(resolve(workspace, 'supabase/config.toml'), configFor(projectId, portBase)); assertUnlinked(workspace);
    writeFileSync(resolve(workspace, 'baseline.sql'), "select current_setting('server_version') as version, encode(digest(pg_get_functiondef('auth.uid()'::regprocedure), 'sha256'), 'hex') as auth_uid_sha256;\n");
    run(['start', '--workdir', workspace, '--exclude', localPg17ServiceExclusions.join(',')], root, env);
    const baseline = run(['db', 'query', '--local', '--workdir', workspace, '--file', resolve(workspace, 'baseline.sql')], root, env);
    if (!baseline.includes('17.6') || !baseline.includes(expectedAuthUid)) fail(`approved PG17/auth.uid baseline mismatch: ${baseline}`);
    const migrations = resolve(workspace, 'supabase/migrations'); mkdirSync(migrations, { recursive: true });
    writeFileSync(resolve(migrations, '00000000000000_p0_deploy_01_fixture.sql'), buildFixtureSql({ sourceEvidenceDir, approvedEvidenceDir: canonicalEvidenceDir }));
    run(['db', 'reset', '--local', '--workdir', workspace], root, env);
    const requiredBaseline = resolve(workspace, 'required-task4-baseline.sql');
    writeFileSync(requiredBaseline, requiredTask4BaselineSql());
    run(['db', 'query', '--local', '--workdir', workspace, '--file', requiredBaseline], root, env);
    applyAuthUsersFixtureOverlay(workspace, env, portBase, afterOverlayStatement);
    return { workspace, projectId, portBase };
  } catch (error) {
    // A failed six-step overlay is never resumable: remove only this exact generated
    // project/workspace, preserve the original failure, and leave retry selection to
    // a fresh materialize invocation with a new project ID and port block.
    let cleanupError;
    if (attemptCreated) {
      try { cleanupProject(projectId, env); } catch (caught) { cleanupError = caught; }
      rmSync(workspace, { recursive: true, force: true });
    }
    if (cleanupError) error.cleanupFailure = cleanupError;
    throw error;
  }
}

const variants = {
  'missing-onboarding-relation': contract => { contract.category_a_relations = contract.category_a_relations.filter(relation => relation.name !== 'onboarding_progress'); },
  // The validator distinguishes FK from CHECK; this controlled fixture removes
  // the captured FK branch of the requested missing-FK/check negative.
  'missing-fk-check': contract => { const r = contract.category_a_relations.find(x => x.name === 'menu_items'); r.constraints = r.constraints.filter(x => x.name !== 'menu_items_restaurant_id_fkey'); },
  'policy-expression': contract => { const r = contract.category_a_relations.find(x => x.name === 'menu_items'); r.policies[0].using = `(${r.policies[0].using}) AND true`; },
  'policy-metadata': contract => { const r = contract.category_a_relations.find(x => x.name === 'menu_items'); r.policies[0].roles = ['anon']; },
  'missing-trigger': contract => { const r = contract.category_a_relations.find(x => x.name === 'menu_items'); r.triggers = r.triggers.filter(x => x.name !== 'menu_items_updated_at'); },
  'missing-helper': contract => { contract.execution_required_trigger_dependency_functions = contract.execution_required_trigger_dependency_functions.slice(1); },
  'function-body-hash': contract => { const fn = contract.category_a_functions.find(x => x.schema === 'public'); fn.functiondef += '\n-- controlled negative\n'; fn.definition_sha256 = createHash('sha256').update(fn.functiondef).digest('hex'); },
  'function-path': contract => { const fn = contract.category_a_functions.find(x => x.schema === 'public'); fn.identity = `moved_${fn.identity}`; },
  'function-public-acl': contract => { const fn = contract.category_a_functions.find(x => x.schema === 'public'); fn.explicit_acl = '{=X/postgres,postgres=X/postgres}'; },
  'auth-uid-behavior': contract => { const fn = contract.category_a_functions.find(x => x.schema === 'auth' && x.identity === 'auth.uid()'); fn.functiondef += '\n-- controlled negative\n'; fn.definition_sha256 = createHash('sha256').update(fn.functiondef).digest('hex'); },
  'duplicate-compound-key': contract => { const r = contract.category_a_relations.find(x => x.name === 'menu_items'); r.constraints = r.constraints.filter(x => x.name !== 'menu_items_restaurant_id_local_id_key'); },
  'nonempty-token': contract => {},
  'column-fk-type-default-null': contract => { const r = contract.category_a_relations.find(x => x.name === 'menu_items'); r.columns.find(x => x.name === 'price').default = '1'; },
  'raw-provenance-hash': (contract, evidence) => { const raw = contract.provenance.raw_capture_envelopes.find(item => existsSync(resolve(evidence, '..', item.path))); const path = resolve(evidence, '..', raw.path); writeFileSync(path, `${readFileSync(path, 'utf8')}\n`, 'utf8'); },
  'cross-tenant-predicate': contract => { const r = contract.category_a_relations.find(x => x.name === 'menu_items'); r.policies[0].using = 'true'; }
};

function writeContract(evidence, contract) {
  const path = resolve(evidence, 'p0-deploy-01c3-category-a-reconstructable-contract.json');
  const text = JSON.stringify(contract);
  writeFileSync(path, text, 'utf8');
  writeFileSync(path.replace(/\.json$/, '.sha256'), `${createHash('sha256').update(text).digest('hex')}  p0-deploy-01c3-category-a-reconstructable-contract.json\n`, 'utf8');
}
function expectedReason(name) {
  return ({ 'missing-onboarding-relation': 'missing required onboarding relation', 'missing-fk-check': 'missing FK constraint', 'policy-expression': 'policy expression mismatch', 'policy-metadata': 'policy metadata mismatch', 'missing-trigger': 'missing trigger:', 'missing-helper': 'missing trigger helper:', 'function-body-hash': 'function body hash mismatch', 'function-path': 'function path mismatch', 'function-public-acl': 'PUBLIC function ACL mismatch', 'auth-uid-behavior': 'auth.uid behavior mismatch', 'duplicate-compound-key': 'missing duplicate compound key guard', 'nonempty-token': 'public_order_tokens approved prestate must be empty', 'column-fk-type-default-null': 'column FK/type/default/null contract mismatch', 'raw-provenance-hash': 'raw provenance hash mismatch', 'cross-tenant-predicate': 'cross-tenant predicate weakening' })[name];
}
export async function runAcceptance({ requestedVariants = Object.keys(variants), workspaceRoot = resolve(root, 'tmp') } = {}) {
  for (const name of requestedVariants) {
    if (!variants[name]) fail(`unknown controlled-negative variant: ${name}`);
    const workspace = resolve(workspaceRoot, `p0-deploy-01-negative-${name}-${randomBytes(5).toString('hex')}`);
    const projectId = `p0-deploy-01-task1-${randomBytes(6).toString('hex')}`;
    let error;
    try {
      await materialize({ workspace, projectId, prepareEvidence: evidence => {
        const contractPath = resolve(evidence, 'p0-deploy-01c3-category-a-reconstructable-contract.json'); const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
        variants[name](contract, evidence); writeContract(evidence, contract);
      } });
      if (name === 'nonempty-token') {
        // Runtime-only negative: the authority contract stays byte-identical.
        // Insert a complete FK chain, then the schema-valid token row, into the
        // otherwise valid materialized prestate. Every token FK resolves to rows
        // inserted through the same real local acceptance connection.
        const insertion = resolve(workspace, 'nonempty-public-order-token.sql');
        writeFileSync(insertion, "DO $task1$ BEGIN\n  INSERT INTO public.organizations (id, owner_user_id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Task 1 token org', 'task1-token-org');\n  INSERT INTO public.restaurants (id, name, slug, organization_id) VALUES ('00000000-0000-0000-0000-000000000002', 'Task 1 token restaurant', 'task1-token-restaurant', '00000000-0000-0000-0000-000000000001');\n  INSERT INTO public.tables (id, restaurant_id, table_name, local_id, name, table_token) VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Task 1 token table', 'task1-token-table', 'Task 1 token table', 'task1-token-table');\n  INSERT INTO public.public_order_tokens (organization_id, restaurant_id, table_id, token_hash) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'task1-runtime-nonempty-token');\nEND $task1$;\n", 'utf8');
        run(['db', 'query', '--local', '--workdir', workspace, '--file', insertion], root, cleanEnv());
        run(['db', 'query', '--local', '--workdir', workspace, '--file', resolve(root, 'scripts/p0-deploy-01-production-prestate-assertions.sql')], root, cleanEnv());
      }
    } catch (caught) { error = caught; }
    finally {
      cleanupProject(projectId, cleanEnv());
      rmSync(workspace, { recursive: true, force: true });
    }
    if (!error || !String(error.message).includes(expectedReason(name))) fail(`controlled-negative ${name} did not produce target reason ${expectedReason(name)}: ${error?.message || 'materializer accepted it'}`);
    process.stdout.write(`PASS controlled-negative ${name}: ${expectedReason(name)}\n`);
  }
  const workspace = resolve(workspaceRoot, `p0-deploy-01-normal-${randomBytes(5).toString('hex')}`);
  const projectId = `p0-deploy-01-task1-${randomBytes(6).toString('hex')}`;
  try {
    await materialize({ workspace, projectId });
    run(['db', 'query', '--local', '--workdir', workspace, '--file', resolve(root, 'scripts/p0-deploy-01-production-prestate-assertions.sql')], root, cleanEnv());
    process.stdout.write('PASS normal PG17 materialization and assertions\n');
  } finally {
    cleanupProject(projectId, cleanEnv());
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--acceptance')) {
    const i = process.argv.indexOf('--variants'); const requestedVariants = i >= 0 ? (process.argv[i + 1] || fail('--variants requires a comma-separated list')).split(',') : undefined;
    await runAcceptance({ requestedVariants });
    process.exit(0);
  }
  const i = process.argv.indexOf('--workspace'); const workspace = i >= 0 ? resolve(process.argv[i + 1] || fail('--workspace requires a path')) : resolve(root, '..', `p0-deploy-01-task1-${Date.now()}`);
  process.stdout.write(`${JSON.stringify(await materialize({ workspace }))}\n`);
}
