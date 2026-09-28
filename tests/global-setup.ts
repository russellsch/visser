// Runs once before any test file.
//
// 1. Build dist/release once. Test files read it but never rebuild it:
//    parallel rebuilds raced (ENOENT on bin/shim.cjs).
// 2. Give the run its own temporary folder, and point TMPDIR, HOME, and
//    VISSER_HOME inside it. Test workers inherit this environment, so a test
//    that forgets to set a home cannot write to the real ~/.visser, and every
//    mkdtemp folder is removed with the run folder at teardown. Earlier runs
//    left about 100 GB of folders in /tmp and created a real ~/.explain.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default function setup(): () => void {
  const root = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });

  const run = mkdtempSync(join(tmpdir(), 'visser-test-run-'));
  const tmp = join(run, 'tmp');
  const home = join(run, 'home');
  mkdirSync(tmp);
  mkdirSync(home);
  process.env['TMPDIR'] = tmp;
  process.env['HOME'] = home;
  process.env['VISSER_HOME'] = join(home, '.visser');

  return () => {
    if (process.env['VISSER_KEEP_TEST_TMP'] === '1') return;
    rmSync(run, { recursive: true, force: true });
  };
}
