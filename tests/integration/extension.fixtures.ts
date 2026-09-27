// Fixtures for extension tests (§14): small extensions with real manifests,
// temporary repositories, and documents that use an extension component.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJSON } from '../../packages/core/src/model/hash.ts';

export const root = new URL('../..', import.meta.url).pathname;
export const cli = join(root, 'dist/release/bin/visser.cjs');
export const example = join(root, 'examples/extensions/timeline-lanes');

const PERMISSIVE_SCHEMA = JSON.stringify({ type: 'object' });

/** Rewrite extension.json for the files in `dir`; returns the digest. */
export function signExtension(dir: string, meta: { name: string; version: string }): string {
  const files = ['GUIDE.md', 'build.cjs', 'schema.json'].map((path) => ({ path, sha256: createHash('sha256').update(readFileSync(join(dir, path))).digest('hex') }));
  const manifest = { schema: 'visser-extension/1', name: meta.name, version: meta.version, api: 'visser-component/1', buildEntry: 'build.cjs', browserEntry: null, schemaFile: 'schema.json', guide: 'GUIDE.md', files };
  writeFileSync(join(dir, 'extension.json'), JSON.stringify(manifest, null, 2) + '\n');
  return createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
}

/** An extension whose build entry is `source`. */
export function makeExtension(dir: string, source: string, opts: { name?: string; version?: string; schema?: string } = {}): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'GUIDE.md'), '# Test extension\n');
  writeFileSync(join(dir, 'build.cjs'), source);
  writeFileSync(join(dir, 'schema.json'), opts.schema ?? PERMISSIVE_SCHEMA);
  return signExtension(dir, { name: opts.name ?? 'timeline-lanes', version: opts.version ?? '0.1.0' });
}

/** A build entry that writes `sentinel`, then prints valid output. */
export function sentinelSource(sentinel: string): string {
  return `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran');\n${readFileSync(join(example, 'build.cjs'), 'utf8')}`;
}

/** A build entry that prints `output` (a JSON value) whatever its input. */
export function fixedOutputSource(output: unknown): string {
  return `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify(output))}));\n`;
}

export function copyExample(dest: string): string {
  cpSync(example, dest, { recursive: true });
  return signExtension(dest, { name: 'timeline-lanes', version: '0.1.0' });
}

export const COMPONENT = [
  '',
  '{% extension id="startup_lanes" use="timeline-lanes" title="Startup work" question="Which startup steps overlap?" unit="ms" %}',
  '{% part id="lane_config" label="Load config" start=0 end=40 %}',
  'Reads and validates the configuration file.',
  '{% /part %}',
  '{% part id="lane_pool" label="Open pool" start=20 end=180 %}',
  'Opens the database connections.',
  '{% /part %}',
  '{% /extension %}',
  '',
].join('\n');

export type Ctx = {
  base: string;
  repo: string;
  env: NodeJS.ProcessEnv;
  run: (...args: string[]) => { status: number | null; stdout: string; stderr: string };
};

export function context(): Ctx {
  const base = mkdtempSync(join(tmpdir(), 'visser-ext-'));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  const env = { ...process.env, VISSER_HOME: join(base, 'home') };
  const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, cwd: repo });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  return { base, repo, env, run };
}

/** A document with the timeline-lanes component; returns index.md. */
export function docWithComponent(ctx: Ctx, name = 'doc', component = COMPONENT): string {
  const dir = join(ctx.repo, 'docs', name);
  const r = ctx.run('init', dir, '--kind', 'teaching', '--title', 'Startup');
  if (r.status !== 0) throw new Error(r.stderr);
  const index = join(dir, 'index.md');
  writeFileSync(index, readFileSync(index, 'utf8') + component);
  return index;
}
