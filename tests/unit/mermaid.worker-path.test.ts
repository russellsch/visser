import { describe, expect, it } from 'vitest';
import { workerPathFor } from '../../packages/core/src/mermaid/parse.ts';

describe('Mermaid worker path in source mode', () => {
  it('decodes a module URL whose directory name contains a space', () => {
    expect(workerPathFor('file:///tmp/My%20Repo/packages/core/src/mermaid/parse.ts')).toBe('/tmp/My Repo/packages/core/src/mermaid/parse-worker.ts');
  });
  it('old behaviour kept the %20 escape (documents the bug)', () => {
    expect(new URL('./parse-worker.ts', 'file:///tmp/My%20Repo/parse.ts').pathname).toBe('/tmp/My%20Repo/parse-worker.ts');
  });
});
