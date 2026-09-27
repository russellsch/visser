// §17.7 exit check: the scripted clean-machine run (scripts/clean-machine.mjs)
// installs the packed archive into an empty VISSER_HOME and then builds,
// exports, and reads a document through the installed user shim only.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;

describe('clean-machine run', () => {
  it('@R09 installs from the archive into an empty VISSER_HOME, then builds, exports, and reads through the shim', () => {
    const result = spawnSync(process.execPath, [join(root, 'scripts/clean-machine.mjs')], { cwd: root, encoding: 'utf8' });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    for (const label of ['install --archive', 'check --release', 'build', 'export --format site', 'read the exported page']) {
      expect(result.stdout).toContain(`ok: ${label}`);
    }
  }, 180_000);
});
