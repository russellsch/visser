// Shared helpers for the Phase 3 code review experiments.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ROOT = '/home/r/Documents/MyStuff/random_ts/visser';
export const QUEUE = join(ROOT, 'examples/bounded-queue/index.md');

export function tempRepo(text?: string, from = QUEUE): { repo: string; doc: string } {
  const repo = mkdtempSync(join(tmpdir(), 'p3cr-'));
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'docs/explanations/doc'), { recursive: true });
  const doc = join(repo, 'docs/explanations/doc/index.md');
  if (text === undefined) copyFileSync(from, doc);
  else writeFileSync(doc, text);
  return { repo, doc };
}

export function code(fn: () => unknown): string {
  try {
    fn();
    return 'OK';
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return `${err.code ?? 'THROW'}: ${(err.message ?? '').slice(0, 140)}`;
  }
}

export const read = (p: string) => readFileSync(p, 'utf8');
