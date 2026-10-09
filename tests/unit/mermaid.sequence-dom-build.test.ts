import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
// @ts-expect-error build scripts are JavaScript modules.
import { sequenceDomAliases, sequenceDomPlugin } from '../../scripts/sequence-dom-build.mjs';

it('bundles the real sanitizer and exact source tracing into a relocated isolated worker', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'visser-sequence-dom-test-'));
  try {
    const output = join(dir, 'sanitizer.cjs');
    const root = process.cwd();
    const entry = `import {prepareSequenceSanitizer,sanitizeSequenceField} from './packages/core/src/mermaid/sequence-sanitize.ts';
      import {ProvenanceText} from './packages/core/src/mermaid/source-provenance.ts';
      (async()=>{await prepareSequenceSanitizer();
        const source='<BR/> &dollar;&dollar;x&dollar;&dollar;';
        const result=sanitizeSequenceField(ProvenanceText.identity(source));
        const start=result.text.indexOf('$$');
        process.stdout.write(JSON.stringify({text:result.text,origin:result.mapRange(start,result.length),
          noGlobals:!('window' in globalThis)&&!('document' in globalThis)}));
      })().catch(error=>{console.error(error);process.exitCode=1});`;
    await build({ stdin: { contents: entry, resolveDir: root }, outfile: output, bundle: true,
      platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent',
      alias: sequenceDomAliases(root), plugins: [sequenceDomPlugin(root)] });
    const child = spawnSync(process.execPath, ['--max-old-space-size=512', output], {
      cwd: dir, env: { ...process.env, NODE_PATH: '' }, encoding: 'utf8', timeout: 30_000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({ text: '<br> $$x$$', noGlobals: true,
      origin: { synthetic: false, intervals: [{ start: 6, end: 39 }] } });
    const bundled = readFileSync(output, 'utf8');
    expect(bundled).not.toContain('require.resolve("./xhr-sync-worker.js")');
    expect(bundled).not.toContain('default-stylesheet.css');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('fails when required DOM patch inputs are missing or an upstream artifact differs', async () => {
  const root = process.cwd();
  await expect(build({ stdin: { contents: 'export const value=1;' }, write: false,
    bundle: true, logLevel: 'silent', plugins: [sequenceDomPlugin(root)] })).rejects.toThrow(/Expected exactly one/);
  const dir = mkdtempSync(join(tmpdir(), 'visser-sequence-dom-mutation-'));
  try {
    const path = join(dir, 'computed-style.js');
    writeFileSync(path, 'module.exports = {};');
    await expect(build({ entryPoints: [path], write: false, bundle: true, platform: 'node',
      logLevel: 'silent', plugins: [sequenceDomPlugin(root)] })).rejects.toThrow(/artifact changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
