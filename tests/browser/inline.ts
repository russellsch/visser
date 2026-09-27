// Serve a document written inline by a test: a temporary repository, the real
// release CLI, and a free port in 4600–4699 (the fixed example ports stay free).
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/explain.cjs');

export type InlineServer = { url: string; indexPath: string; close: () => void };

/** A document with the given body under the standard frontmatter. */
export function inlineDoc(title: string, body: string, docId = '6c1f3e2a-4b5d-4e6f-8a7b-9c0d1e2f3a4b'): string {
  return `---
format: explain/1
docId: ${docId}
title: ${JSON.stringify(title)}
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# ${title}

${body}
`;
}

function startOnce(indexPath: string, port: number): Promise<{ url: string; child: ChildProcess } | undefined> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'serve', indexPath, '--port', String(port), '--dev-toolkit', join(root, 'dist/release')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      settle(() => reject(new Error(`serve did not start within 30 s: ${err}`)));
    }, 30_000);
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const m = /serving (http:\/\/\S+index\.html)/.exec(out);
      if (m) settle(() => resolve({ url: m[1]!, child }));
    });
    child.stderr!.on('data', (chunk: Buffer) => { err += chunk.toString(); });
    child.on('exit', () => settle(() => (err.includes('E_PORT_BUSY') ? resolve(undefined) : reject(new Error(`serve failed: ${err}`)))));
  });
}

export async function serveInline(markdown: string): Promise<InlineServer> {
  const repo = mkdtempSync(join(tmpdir(), 'explain-inline-'));
  mkdirSync(join(repo, '.git'));
  const dir = join(repo, 'docs/explanations/inline');
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, 'index.md');
  writeFileSync(indexPath, markdown);
  for (let attempt = 0; attempt < 10; attempt++) {
    const port = 4600 + Math.floor(Math.random() * 100);
    const started = await startOnce(indexPath, port);
    if (started) return { url: started.url, indexPath, close: () => started.child.kill() };
  }
  throw new Error('no free port in 4600-4699');
}
