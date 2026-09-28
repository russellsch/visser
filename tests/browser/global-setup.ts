// Runs once before the browser tests. Gives the run its own temporary folder
// and points TMPDIR, HOME, and VISSER_HOME inside it; the workers inherit this
// environment. The returned function removes the folder after the run, so the
// specs cannot leave mkdtemp folders in /tmp or write to the real ~/.visser.
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export default function setup(): () => void {
  // Playwright finds its browsers under HOME; keep the real location before HOME changes.
  const browsers = join(homedir(), '.cache', 'ms-playwright');
  if (!process.env['PLAYWRIGHT_BROWSERS_PATH'] && existsSync(browsers)) process.env['PLAYWRIGHT_BROWSERS_PATH'] = browsers;
  const run = mkdtempSync(join(tmpdir(), 'visser-browser-run-'));
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
