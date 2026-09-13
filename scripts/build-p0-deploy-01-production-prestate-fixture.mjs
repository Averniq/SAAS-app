#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = resolve(root, 'evidence');
const c2Name = 'p0-deploy-01c2-category-a-production-catalog-capture.json';
const c3Name = 'p0-deploy-01c3-category-a-reconstructable-contract.json';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`P0-DEPLOY-01 fixture evidence gap: ${message}`); };
const quoteIdent = value => `"${String(value).replaceAll('"', '""')}"`;
const qualified = relation => `${quoteIdent(relation.schema)}.${quoteIdent(relation.name || relation.relation.split('.').at(-1))}`;
const functionRef = fn => fn.identity.startsWith(`${fn.schema}.`) ? fn.identity : `${quoteIdent(fn.schema)}.${fn.identity}`;

function readVerifiedEvidence(name, sourceEvidenceDir = evidenceDir, sidecarName = name.replace(/\.json$/, '.sha256')) {
  const path = resolve(sourceEvidenceDir, name);
  const sidecar = resolve(sourceEvidenceDir, sidecarName);
  if (!existsSync(path) || !existsSync(sidecar)) fail(`missing ${name} or its SHA-256 sidecar`);
  const text = readFileSync(path, 'utf8');
  const expected = readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(text) !== expected) fail(`SHA-256 sidecar mismatch for ${name}`);
  return JSON.parse(text);
}

function readVerifiedText(name, sourceEvidenceDir = evidenceDir, sidecarName = `${name}.sha256`) {
  const path = resolve(sourceEvidenceDir, name);
  const sidecar = resolve(sourceEvidenceDir, sidecarName);
  if (!existsSync(path) || !existsSync(sidecar)) fail(`missing ${name} or its SHA-256 sidecar`);
  const text = readFileSync(path, 'utf8');
  const expected = readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(text) !== expected) fail(`SHA-256 sidecar mismatch for ${name}`);
  return text;
}

function parseOperatorCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...body] = rows;
  if (!headers?.length) fail('empty operator CSV capture');
  return body.filter(rowValue => rowValue.length === headers.length).map(rowValue => Object.fromEntries(headers.map((header, index) => [header, rowValue[index]])));
}

function task2FunctionSupplement(sourceEvidenceDir) {
  const jsonName = 'p0-deploy-01-task2-batch2a-production-function-capture-20260904T031503Z.json';
  const csvName = 'p0-01d-batch12-production-catalog-capture.csv';
  const relationName = 'p0-deploy-01-task2-restaurant-invites-production-relation-capture-20260904T054241Z.json';
  const batch = readVerifiedEvidence(jsonName, sourceEvidenceDir, `${jsonName}.sha256`);
  const relationCapture = readVerifiedEvidence(relationName, sourceEvidenceDir, `${relationName}.sha256`);
  const csvRows = parseOperatorCsv(readVerifiedText(csvName, sourceEvidenceDir));
  const targetIdentities = [
    'is_restaurant_staff(uuid)', 'has_restaurant_role(uuid,text[])',
    'create_restaurant_for_owner(text,text,text,text,text,text)', 'create_restaurant_tables(uuid,integer)',
    'is_platform_admin()', 'platform_create_restaurant(text,text,text,text,integer)',
    'can_manage_restaurant_staff(uuid)', 'accept_restaurant_invite(uuid)',
    'record_restaurant_order_payment(uuid,uuid,text)', 'list_restaurant_team(uuid)', 'revoke_restaurant_invite(uuid)'
  ];
  const batchFunctions = new Map(batch.functions.map(fn => [fn.canonical_regprocedure_identity.replace(/^public\./, ''), {
    schema: 'public', identity: fn.canonical_regprocedure_identity.replace(/^public\./, ''), functiondef: fn.function_definition,
    definition_sha256: fn.definition_sha256, explicit_acl: fn.explicit_acl,
    owner: fn.owner, security_definer: fn.security_definer, proconfig: fn.proconfig, language: fn.language,
    volatility: fn.volatility, strict: fn.strict, leakproof: fn.leakproof, parallel: fn.parallel,
    result_identity: fn.result_identity, identity_arguments: fn.identity_arguments, overload_count: fn.overload_count
  }]));
  const csvByIdentity = new Map();
  for (const row of csvRows) {
    if (row.object_type !== 'function' || !targetIdentities.includes(row.identity)) continue;
    const entry = csvByIdentity.get(row.identity) || {};
    entry[row.attribute] = row.value;
    csvByIdentity.set(row.identity, entry);
  }
  const functions = targetIdentities.map(identity => {
    const fromBatch = batchFunctions.get(identity);
    if (fromBatch) return fromBatch;
    const source = csvByIdentity.get(identity);
    if (!source?.definition || !source.raw_acl || !source.metadata) fail(`missing Task 2 function capture rows: public.${identity}`);
    const metadata = Object.fromEntries(source.metadata.split('; ').map(part => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]));
    if (metadata.owner !== 'postgres' || metadata.security_definer !== 'true' || !metadata.proconfig || !metadata.language || !metadata.volatility || !metadata.result || !Object.hasOwn(metadata, 'identity_arguments')) fail(`incomplete Task 2 function metadata: public.${identity}`);
    return {
      schema: 'public', identity, functiondef: source.definition, definition_sha256: sha256(source.definition), explicit_acl: source.raw_acl,
      owner: metadata.owner, security_definer: metadata.security_definer === 'true', proconfig: [metadata.proconfig],
      language: metadata.language.toLowerCase(), volatility: metadata.volatility.toLowerCase(), strict: metadata.strict === 'true',
      leakproof: metadata.leakproof === 'true', parallel: metadata.parallel?.slice(0, 1).toLowerCase(),
      result_identity: metadata.result, identity_arguments: metadata.identity_arguments, overload_count: 1
    };
  });
  const relation = relationCapture.relation;
  if (relation?.schema !== 'public' || relation?.name !== 'restaurant_invites' || relation.relkind !== 'r' || relation.owner !== 'postgres' || !Array.isArray(relation.columns) || relation.columns.length !== 11 || !Array.isArray(relation.constraints) || relation.constraints.length !== 7 || !Array.isArray(relation.indexes) || relation.indexes.length !== 6 || !Array.isArray(relation.policies) || relation.policies.length !== 0 || !Array.isArray(relation.triggers) || relation.triggers.length !== 0 || !relation.explicit_acl) fail('incomplete Task 2 restaurant_invites relation capture');
  return { relation: { ...relation, relation_acl: relation.explicit_acl }, functions };
}

function task3KitchenSupplement(sourceEvidenceDir) {
  const jsonName = 'p0-deploy-01-task3-restaurant-tables-absence-and-kitchen-reference-capture-20260904T060936Z.json';
  const capture = readVerifiedEvidence(jsonName, sourceEvidenceDir, `${jsonName}.sha256`);
  if (capture?.relation_state?.to_regclass !== null || capture.relation_state?.exists !== false || capture.relation_state?.public_tables_to_regclass !== 'tables') fail('Task 3 restaurant_tables absence contract is not affirmative');
  const claim = capture.claim_kitchen_print_job;
  if (claim?.identity !== 'public.claim_kitchen_print_job(text)' || claim.owner !== 'postgres' || !claim.security_definer || JSON.stringify(claim.proconfig) !== JSON.stringify(['search_path=public']) || claim.direct_reference_proven !== 'public.restaurant_tables' || !claim.function_definition || sha256(claim.function_definition) !== claim.definition_sha256) fail('incomplete Task 3 claim function capture');
  const csvRows = parseOperatorCsv(readVerifiedText('p0-01d-batch12-production-catalog-capture.csv', sourceEvidenceDir));
  const finishRows = {};
  for (const row of csvRows) if (row.object_type === 'function' && row.identity === 'finish_kitchen_print_job(uuid,boolean,text)') finishRows[row.attribute] = row.value;
  const metadata = Object.fromEntries((finishRows.metadata || '').split('; ').filter(Boolean).map(part => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]));
  const finish = capture.finish_kitchen_print_job;
  if (finish?.identity !== 'public.finish_kitchen_print_job(uuid,boolean,text)' || !finish.function_definition || sha256(finish.function_definition) !== finish.definition_sha256 || finish.function_definition !== finishRows.definition || !finishRows.raw_acl || metadata.owner !== 'postgres' || metadata.security_definer !== 'true' || metadata.proconfig !== 'search_path=public') fail('incomplete Task 3 finish function capture');
  return { functions: [
    { schema: 'public', identity: 'claim_kitchen_print_job(text)', functiondef: claim.function_definition, definition_sha256: claim.definition_sha256, explicit_acl: claim.explicit_acl, owner: claim.owner, security_definer: claim.security_definer, proconfig: claim.proconfig, fixture_allow_absent_relation_reference: true },
    { schema: 'public', identity: 'finish_kitchen_print_job(uuid,boolean,text)', functiondef: finish.function_definition, definition_sha256: finish.definition_sha256, explicit_acl: finishRows.raw_acl, owner: metadata.owner, security_definer: metadata.security_definer === 'true', proconfig: [metadata.proconfig] }
  ] };
}

function relationKey(relation) { return `${relation.schema}.${relation.name || relation.relation?.split('.').at(-1)}`; }
function functionKey(fn) { return `${fn.schema}.${fn.identity}`; }
function failChangedContract(contract, approved) {
  const candidateRelations = new Map([...contract.category_a_relations, ...contract.execution_required_non_category_relation_dependencies, ...contract.fk_parent_contracts].map(relation => [relationKey(relation), relation]));
  for (const relation of [...approved.category_a_relations, ...approved.execution_required_non_category_relation_dependencies, ...approved.fk_parent_contracts]) {
    const actual = candidateRelations.get(relationKey(relation));
    if (!actual) fail(relationKey(relation).includes('onboarding') ? 'missing required onboarding relation' : `missing required relation: ${relationKey(relation)}`);
    const expectedConstraints = relation.constraints || relation.key_constraints;
    const actualConstraints = new Map((actual.constraints || actual.key_constraints || []).map(constraint => [constraint.name, constraint]));
    for (const expected of expectedConstraints) {
      const got = actualConstraints.get(expected.name);
      if (!got) {
        if (expected.type === 'f') fail(`missing FK constraint: ${relationKey(relation)}.${expected.name}`);
        if (expected.type === 'c') fail(`missing CHECK constraint: ${relationKey(relation)}.${expected.name}`);
        if (expected.type === 'u' && /,/.test(expected.definition)) fail(`missing duplicate compound key guard: ${relationKey(relation)}.${expected.name}`);
        fail(`missing constraint: ${relationKey(relation)}.${expected.name}`);
      }
      if (got.definition !== expected.definition || got.type !== expected.type) fail(`constraint contract mismatch: ${relationKey(relation)}.${expected.name}`);
    }
    const actualColumns = new Map((actual.columns || []).map(column => [column.name, column]));
    for (const expected of relation.columns || []) {
      const got = actualColumns.get(expected.name);
      if (!got) fail(`missing column: ${relationKey(relation)}.${expected.name}`);
      for (const field of ['type', 'default', 'not_null']) if (got[field] !== expected[field]) {
        if (/token/i.test(expected.name) && field === 'not_null') fail(`non-empty token requirement mismatch: ${relationKey(relation)}.${expected.name}`);
        fail(`column FK/type/default/null contract mismatch: ${relationKey(relation)}.${expected.name}.${field}`);
      }
    }
    const actualPolicies = new Map((actual.policies || []).map(policy => [policy.name, policy]));
    for (const expected of relation.policies || []) {
      const got = actualPolicies.get(expected.name);
      if (!got) fail(`policy metadata mismatch: ${relationKey(relation)}.${expected.name}`);
      if (got.using !== expected.using || got.with_check !== expected.with_check) {
        if (/organization_id|restaurant_id/.test(expected.using || expected.with_check || '') && !/organization_id|restaurant_id/.test(got.using || got.with_check || '')) fail(`cross-tenant predicate weakening: ${relationKey(relation)}.${expected.name}`);
        fail(`policy expression mismatch: ${relationKey(relation)}.${expected.name}`);
      }
      for (const field of ['command', 'permissive', 'roles']) if (JSON.stringify(got[field]) !== JSON.stringify(expected[field])) fail(`policy metadata mismatch: ${relationKey(relation)}.${expected.name}.${field}`);
    }
    const actualTriggers = new Set((actual.triggers || []).map(trigger => trigger.name));
    for (const trigger of relation.triggers || []) if (!actualTriggers.has(trigger.name)) fail(`missing trigger: ${relationKey(relation)}.${trigger.name}`);
  }
  const candidateFunctions = new Map([...contract.category_a_functions, ...contract.execution_required_trigger_dependency_functions].map(fn => [functionKey(fn), fn]));
  for (const expected of [...approved.category_a_functions, ...approved.execution_required_trigger_dependency_functions]) {
    const got = candidateFunctions.get(functionKey(expected));
    if (!got) {
      const moved = [...candidateFunctions.values()].find(fn => fn.definition_sha256 === expected.definition_sha256);
      if (moved) fail(`function path mismatch: ${functionKey(expected)}`);
      if (expected.schema === 'auth' && expected.identity === 'auth.uid()') fail('auth.uid behavior mismatch');
      if (approved.execution_required_trigger_dependency_functions.some(fn => functionKey(fn) === functionKey(expected))) fail(`missing trigger helper: ${functionKey(expected)}`);
      fail(`function body hash mismatch: ${functionKey(expected)}`);
    }
    if (got.definition_sha256 !== expected.definition_sha256 || got.functiondef !== expected.functiondef) {
      if (expected.schema === 'auth' && expected.identity === 'auth.uid()') fail('auth.uid behavior mismatch');
      fail(`function body hash mismatch: ${functionKey(expected)}`);
    }
    if (got.explicit_acl !== expected.explicit_acl) {
      if (/(^|[,{])=X\//.test(got.explicit_acl || '')) fail(`PUBLIC function ACL mismatch: ${functionKey(expected)}`);
      fail(`function ACL mismatch: ${functionKey(expected)}`);
    }
  }
}

function validate(contract, approved) {
  // Compare first so controlled evidence changes get the precise refusal reason,
  // rather than a downstream SQL-shape error such as a changed cardinality.
  if (approved) failChangedContract(contract, approved);
  const validator = contract.completeness_validator;
  if (!validator?.all_contract_content_materialized_from_raw_capture_envelopes || !validator?.all_execution_required_relations_reconstructable) fail('contract completeness validator is not affirmative');
  const category = contract.category_a_functions;
  const trigger = contract.execution_required_trigger_dependency_functions;
  if (category.length !== validator.category_a_function_count || contract.category_a_relations.length !== validator.category_a_relation_count) fail('Category-A cardinality differs from the captured validator');
  const allFunctions = [...category, ...trigger];
  for (const fn of allFunctions) {
    if (!fn.functiondef || sha256(fn.functiondef) !== fn.definition_sha256) fail(`function body hash mismatch for ${fn.schema}.${fn.identity}`);
    if (!fn.explicit_acl) fail(`missing explicit ACL for ${fn.schema}.${fn.identity}`);
  }
  const authUid = category.find(fn => fn.schema === 'auth' && fn.identity === 'auth.uid()');
  if (!authUid || authUid.definition_sha256 !== validator.auth_uid_definition_sha256) fail('auth.uid() exact-hash contract is absent or inconsistent');
  const fullRelations = [...contract.category_a_relations, ...contract.execution_required_non_category_relation_dependencies];
  const relations = [...fullRelations, ...contract.fk_parent_contracts];
  for (const relation of relations) {
    const constraints = relation.constraints || relation.key_constraints;
    if (!Array.isArray(relation.columns) || !Array.isArray(constraints) || !Array.isArray(relation.indexes) || !relation.relation_acl) fail(`incomplete relation contract for ${relation.schema}.${relation.name || relation.relation}`);
    if (fullRelations.includes(relation)) for (const column of relation.columns) if (!['ordinal', 'name', 'type', 'default', 'not_null', 'identity', 'generated'].every(key => key in column)) fail(`incomplete column contract for ${relation.schema}.${relation.name || relation.relation}.${column.name}`);
  }
  for (const raw of contract.provenance?.raw_capture_envelopes || []) {
    const path = resolve(arguments[2] || evidenceDir, '..', raw.path);
    if (!existsSync(path)) fail(`missing raw provenance envelope: ${raw.path}`);
    if (sha256(readFileSync(path)) !== raw.sha256) fail(`raw provenance hash mismatch: ${raw.path}`);
  }
  return { allFunctions, relations };
}

function columnSql(column) {
  const generated = column.generated ? ` GENERATED ALWAYS AS (${column.generated}) STORED` : '';
  const identityMode = ({ a: 'ALWAYS', d: 'BY DEFAULT' })[column.identity];
  if (column.identity && !identityMode) fail(`unknown identity mode for ${column.name}`);
  const identity = identityMode ? ` GENERATED ${identityMode} AS IDENTITY` : '';
  const collation = column.collation && column.collation !== '"default"' ? ` COLLATE ${column.collation}` : '';
  return `${quoteIdent(column.name)} ${column.type}${collation}${identity}${generated}${column.default == null || column.generated ? '' : ` DEFAULT ${column.default}`}${column.not_null ? ' NOT NULL' : ''}`;
}

function aclSql(acl, objectType, target) {
  const entries = acl.slice(1, -1).split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).filter(Boolean);
  const letters = { a: 'INSERT', r: 'SELECT', w: 'UPDATE', d: 'DELETE', D: 'TRUNCATE', x: 'REFERENCES', t: 'TRIGGER', X: 'EXECUTE', U: 'USAGE', C: 'CREATE', c: 'CONNECT', T: 'TEMPORARY', m: 'MAINTAIN' };
  const statements = [`REVOKE ALL PRIVILEGES ON ${objectType} ${target} FROM PUBLIC, anon, authenticated, service_role, postgres, dashboard_user, supabase_auth_admin;`];
  for (const entry of entries) {
    const [subject, rest] = entry.split('='); const privileges = (rest || '').split('/')[0];
    const grant = [...privileges].map(letter => letters[letter]).filter(Boolean);
    if (grant.length) statements.push(`GRANT ${grant.join(', ')} ON ${objectType} ${target} TO ${subject ? quoteIdent(subject) : 'PUBLIC'};`);
  }
  return statements.join('\n');
}

function policySql(relation, policy) {
  const command = ({ r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' })[policy.command];
  if (!command) fail(`unknown policy command ${policy.command}`);
  const roles = policy.roles.map(quoteIdent).join(', ');
  return `CREATE POLICY ${quoteIdent(policy.name)} ON ${qualified(relation)} AS ${policy.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'} FOR ${command} TO ${roles}${policy.using ? ` USING (${policy.using})` : ''}${policy.with_check ? ` WITH CHECK (${policy.with_check})` : ''};`;
}

export function buildFixtureSql({ sourceEvidenceDir = evidenceDir, approvedEvidenceDir = sourceEvidenceDir } = {}) {
  readVerifiedEvidence(c2Name, sourceEvidenceDir); // C2 is integrity-gated even though C3 is the reconstructable source.
  const contract = readVerifiedEvidence(c3Name, sourceEvidenceDir);
  const approved = sourceEvidenceDir === approvedEvidenceDir ? contract : readVerifiedEvidence(c3Name, approvedEvidenceDir);
  const { allFunctions: canonicalFunctions, relations: canonicalRelations } = validate(contract, approved, sourceEvidenceDir);
  const supplement = task2FunctionSupplement(sourceEvidenceDir);
  const task3Supplement = task3KitchenSupplement(sourceEvidenceDir);
  const functionMap = new Map(canonicalFunctions.map(fn => [functionKey(fn), fn]));
  for (const fn of [...supplement.functions, ...task3Supplement.functions]) functionMap.set(functionKey(fn), fn);
  const relationMap = new Map(canonicalRelations.map(relation => [relationKey(relation), relation]));
  if (relationMap.has(relationKey(supplement.relation))) fail(`duplicate Task 2 supplemental relation: ${relationKey(supplement.relation)}`);
  relationMap.set(relationKey(supplement.relation), supplement.relation);
  const allFunctions = [...functionMap.values()];
  const relations = [...relationMap.values()];
  const materializedRelations = relations.filter(relation => relation.schema !== 'auth');
  const capturedContract = JSON.stringify(contract);
  if (capturedContract.includes('$p0contract$')) fail('contract cannot be safely dollar-quoted');
  const sql = ['BEGIN;', 'CREATE EXTENSION IF NOT EXISTS pgcrypto;', 'CREATE SCHEMA IF NOT EXISTS p0_deploy_01_fixture;', 'CREATE TABLE p0_deploy_01_fixture.contract (payload jsonb NOT NULL);', `INSERT INTO p0_deploy_01_fixture.contract(payload) VALUES ($p0contract$${capturedContract}$p0contract$::jsonb);`];
  for (const relation of materializedRelations) sql.push(`CREATE TABLE ${qualified(relation)} (\n  ${relation.columns.sort((a,b) => a.ordinal-b.ordinal).map(columnSql).join(',\n  ')}\n);`);
  const constraints = materializedRelations.flatMap(relation => (relation.constraints || relation.key_constraints).map(constraint => ({ relation, constraint })));
  for (const { relation, constraint } of [...constraints.filter(item => item.constraint.type !== 'f'), ...constraints.filter(item => item.constraint.type === 'f')]) sql.push(`ALTER TABLE ONLY ${qualified(relation)} ADD CONSTRAINT ${quoteIdent(constraint.name)} ${constraint.definition};`);
  for (const relation of materializedRelations) {
    const constraintBackedIndexNames = new Set((relation.constraints || relation.key_constraints).map(constraint => constraint.name));
    for (const index of relation.indexes) {
      const indexName = typeof index === 'string' ? index.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:"((?:[^"]|"")*)"|(\S+))/i)?.slice(1).find(Boolean)?.replaceAll('""', '"') : index.name;
      if (indexName && constraintBackedIndexNames.has(indexName)) continue;
    sql.push(`${index.definition || index};`);
    }
  }
  for (const fn of allFunctions.filter(fn => fn.schema !== 'auth')) {
    if (fn.fixture_allow_absent_relation_reference) sql.push("SET LOCAL check_function_bodies = off;");
    sql.push(`${fn.functiondef.trim()};`, aclSql(fn.explicit_acl, 'FUNCTION', functionRef(fn)));
    if (fn.fixture_allow_absent_relation_reference) {
      sql.push("SET LOCAL check_function_bodies = on;", `DO $p0_task3_absent_relation$ BEGIN IF to_regclass('public.restaurant_tables') IS NOT NULL THEN RAISE EXCEPTION 'Task 3 fixture must preserve absent public.restaurant_tables'; END IF; IF encode(digest(pg_get_functiondef('${fn.schema}.${fn.identity}'::regprocedure), 'sha256'), 'hex') <> '${fn.definition_sha256}' THEN RAISE EXCEPTION 'Task 3 captured stale function hash mismatch'; END IF; END $p0_task3_absent_relation$;`);
    }
  }
  for (const relation of materializedRelations) {
    sql.push(`ALTER TABLE ${qualified(relation)} OWNER TO ${quoteIdent(relation.owner)};`, relation.rls_enabled ? `ALTER TABLE ${qualified(relation)} ENABLE ROW LEVEL SECURITY;` : `ALTER TABLE ${qualified(relation)} DISABLE ROW LEVEL SECURITY;`, relation.rls_forced ? `ALTER TABLE ${qualified(relation)} FORCE ROW LEVEL SECURITY;` : `ALTER TABLE ${qualified(relation)} NO FORCE ROW LEVEL SECURITY;`);
    for (const policy of relation.policies || []) sql.push(policySql(relation, policy));
    sql.push(aclSql(relation.relation_acl, 'TABLE', qualified(relation)));
  }
  for (const relation of materializedRelations) for (const trigger of relation.triggers || []) sql.push(`${trigger.definition};`, trigger.enabled === 'O' ? '' : `ALTER TABLE ${qualified(relation)} ${trigger.enabled === 'D' ? 'DISABLE' : 'ENABLE REPLICA'} TRIGGER ${quoteIdent(trigger.name)};`);
  sql.push('COMMIT;'); return `${sql.filter(Boolean).join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output'); const output = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1] || fail('--output requires a path')) : null;
  const sql = buildFixtureSql(); if (output) writeFileSync(output, sql, 'utf8'); else process.stdout.write(sql);
}
