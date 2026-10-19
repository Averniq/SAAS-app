import { readFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (!args.includes('--local') || args.some(arg => /linked|https?:|postgres:|supabase\.co/.test(arg))) throw new Error('Only --local isolated kitchen fixtures are permitted');
const workspaceArg = args[args.indexOf('--workspace') + 1];
if (!args.includes('--workspace') || !workspaceArg) throw new Error('--workspace must name the isolated materialized candidate');
const workspace = await realpath(path.resolve(root, workspaceArg));
const relative = path.relative(root, workspace);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Local workspace escaped implementation worktree');
const marker = JSON.parse(await readFile(path.join(workspace, 'kitchen-local.json'), 'utf8'));
if (marker.localOnly !== true || !/^aveniq-kitchen-[a-z0-9-]+$/.test(marker.projectId)) throw new Error('Missing isolated local project marker');
const container = `supabase_db_${marker.projectId}`;
function docker(argv, input) {
  const result = spawnSync('docker', argv, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Local Docker operation failed');
  return result.stdout;
}
const info = JSON.parse(docker(['inspect', container]))[0];
if (info.Config.Labels['com.supabase.cli.project'] !== marker.projectId || path.resolve(info.Config.Labels['com.supabase.cli.workdir']) !== workspace) throw new Error('Isolated Docker project/workspace identity mismatch');
const suite = args[args.indexOf('--suite') + 1];
const suites = { access: ['access', 'config'], dispatch: ['dispatch', 'compatibility'], delivery: ['delivery', 'history'], concurrency: ['concurrency'], acceptance: ['acceptance'] };
if (!suites[suite]) throw new Error('Unknown local suite');
for (const name of suites[suite]) {
  const sql = await readFile(path.join(root, `tests/sql/kitchen-printing-${name}.sql`), 'utf8');
  process.stdout.write(docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], sql));
}
console.log(`PASS local ${suite}; isolated project ${marker.projectId}`);
