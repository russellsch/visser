// A reader that closes the pipe early (`visser skill show | head -1`) must
// not crash the CLI with an unhandled EPIPE; the command finishes and exits
// with its own code.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const release = join(root, 'dist/release');
const cli = join(release, 'bin/visser.cjs');

function closedPipe(args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    // Close the read end at once: every later write by the CLI gets EPIPE.
    child.stdout.destroy();
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

describe('closed stdout (EPIPE)', () => {
  it('skill show exits 0 without an unhandled error when stdout closes early', async () => {
    for (let i = 0; i < 3; i++) {
      const result = await closedPipe(['skill', 'show', '--toolkit-dir', release]);
      expect(result.stderr).not.toMatch(/Unhandled|EPIPE|internal error/);
      expect(result.status).toBe(0);
    }
  });

  it('a failing command keeps its own exit code when stdout closes early', async () => {
    const result = await closedPipe(['catalogue', 'show', 'no-such-pattern', '--toolkit-dir', release]);
    expect(result.stderr).not.toMatch(/Unhandled|internal error/);
    expect(result.status).toBe(2);
  });
});
