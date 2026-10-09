import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
// @ts-expect-error build scripts are JavaScript, outside the TypeScript project.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

describe('version-checked Mermaid build patch', () => {
  it('fails before patching a changed XY artifact', async () => {
    const dir=mkdtempSync(join(tmpdir(),'visser-xy-patch-'));
    try {
      const file=join(dir,'xychartDiagram-changed.mjs');
      writeFileSync(file,readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs'),'utf8')+'\n// changed\n');
      await expect(build({entryPoints:[file],bundle:true,write:false,logLevel:'silent',plugins:[mermaidMathPlugin(process.cwd())]})).rejects.toThrow('Mermaid XY artifact changed');
    } finally {rmSync(dir,{recursive:true,force:true});}
  });

  it('fails before patching a changed quadrant artifact', async () => {
    const dir=mkdtempSync(join(tmpdir(),'visser-quadrant-patch-'));
    try {
      const file=join(dir,'quadrantDiagram-changed.mjs');
      writeFileSync(file,readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/quadrantDiagram-O4NWA36T.mjs'),'utf8')+'\n// changed\n');
      await expect(build({entryPoints:[file],bundle:true,write:false,logLevel:'silent',plugins:[mermaidMathPlugin(process.cwd())]})).rejects.toThrow('Mermaid quadrant artifact changed');
    } finally {rmSync(dir,{recursive:true,force:true});}
  });

  it('fails before patching a changed journey artifact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-journey-patch-'));
    try {
      const file = join(dir, 'journeyDiagram-changed.mjs');
      writeFileSync(file, readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/journeyDiagram-ZHPQQLJL.mjs'), 'utf8') + '\n// changed\n');
      await expect(build({ entryPoints: [file], bundle: true, write: false, logLevel: 'silent',
        plugins: [mermaidMathPlugin(process.cwd())] })).rejects.toThrow('Mermaid journey artifact changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('fails before patching a changed sequence artifact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-sequence-patch-'));
    try {
      const file = join(dir, 'sequenceDiagram-changed.mjs');
      writeFileSync(file, readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/sequenceDiagram-PO4LG4MO.mjs'), 'utf8') + '\n// changed\n');
      await expect(build({ entryPoints: [file], bundle: true, write: false, logLevel: 'silent',
        plugins: [mermaidMathPlugin(process.cwd())] })).rejects.toThrow('Mermaid sequence artifact changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('fails before patching a changed state artifact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-state-patch-'));
    try {
      const file = join(dir, 'stateDiagram-v2-changed.mjs');
      writeFileSync(file, readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs'), 'utf8') + '\n// changed\n');
      await expect(build({ entryPoints: [file], bundle: true, write: false, logLevel: 'silent',
        plugins: [mermaidMathPlugin(process.cwd())] })).rejects.toThrow('Mermaid state artifact changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('fails before accepting changed shape applicability', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-shapes-patch-'));
    try {
      const file = join(dir, 'chunk-7INBJB4K.mjs');
      writeFileSync(file, readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-7INBJB4K.mjs'), 'utf8') + '\n// changed\n');
      await expect(build({ entryPoints: [file], bundle: true, write: false, logLevel: 'silent',
        plugins: [mermaidMathPlugin(process.cwd())] })).rejects.toThrow('Mermaid shape artifact changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('fails before patching a changed shared text artifact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-text-patch-'));
    try {
      const file = join(dir, 'chunk-MBY4JIJT.mjs');
      writeFileSync(file, readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-MBY4JIJT.mjs'), 'utf8') + '\n// changed\n');
      await expect(build({ entryPoints: [file], bundle: true, write: false, logLevel: 'silent',
        plugins: [mermaidMathPlugin(process.cwd())] })).rejects.toThrow('Mermaid shared text artifact changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('fails if the entry graph contains no matching pie chunk', async () => {
    await expect(build({ stdin: { contents: 'globalThis.mermaid = {};', resolveDir: process.cwd() },
      bundle: true, write: false, logLevel: 'silent', plugins: [mermaidMathPlugin(process.cwd())] }))
      .rejects.toMatchObject({ errors: expect.arrayContaining([
        expect.objectContaining({ text: 'Expected one Mermaid pie patch; applied 0' }),
      ]) });
  });
  it('fails before patching a changed upstream artifact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-pie-patch-'));
    try {
      const file = join(dir, 'pieDiagram-changed.mjs');
      const original = readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/pieDiagram-5QR66LMP.mjs'), 'utf8');
      writeFileSync(file, original + '\n// changed\n');
      await expect(build({ entryPoints: [file], bundle: true, write: false, logLevel: 'silent',
        plugins: [mermaidMathPlugin(process.cwd())] })).rejects.toThrow('Mermaid pie artifact changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('fails before patching a changed timeline artifact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-timeline-patch-'));
    try {
      const file = join(dir, 'timeline-definition-changed.mjs');
      const original = readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/timeline-definition-EJHVYXUP.mjs'), 'utf8');
      writeFileSync(file, original + '\n// changed\n');
      await expect(build({ entryPoints: [file], bundle: true, write: false, logLevel: 'silent',
        plugins: [mermaidMathPlugin(process.cwd())] })).rejects.toThrow('Mermaid timeline artifact changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
