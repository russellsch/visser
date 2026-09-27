// Browser tests (§18.4, §18.8).
//
// Target: 'fixture' serves tests/browser/fixtures/contract.html with a freshly
// bundled runtime; 'real' serves the built bounded-queue snapshot through
// `explain serve`. Switch with EXPLAIN_BROWSER_TARGET or DEFAULT_TARGET below.
//
// Tiers (Chromium only, by decision of 27 September 2026): the default
// per-commit tier runs Chromium at 1440 and 320 plus a no-JavaScript project.
// EXPLAIN_BROWSER_TIER=full adds 1024, 390, and reduced motion.
import { defineConfig, devices, type Project } from '@playwright/test';
import { EXAMPLE_PORTS, EXAMPLES } from './tests/browser/examples.ts';

const DEFAULT_TARGET: 'fixture' | 'real' = 'real';
const target = (process.env['EXPLAIN_BROWSER_TARGET'] as 'fixture' | 'real' | undefined) ?? DEFAULT_TARGET;
const full = process.env['EXPLAIN_BROWSER_TIER'] === 'full';

const port = target === 'real' ? EXAMPLE_PORTS['bounded-queue'] : 4312;
const baseURL = `http://127.0.0.1:${port}`;

const desktop = (width: number, height: number) => ({ viewport: { width, height } });
const JS_ONLY = { grepInvert: /@nojs/ };
const NOJS_ONLY = { grep: /@nojs/, use: { ...desktop(1440, 1000), javaScriptEnabled: false } };
const narrow = (width: number, height: number) => ({ viewport: { width, height }, isMobile: true, hasTouch: true });

const perCommit: Project[] = [
  { name: 'chromium-1440', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000) } },
  { name: 'chromium-320', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...narrow(320, 720) } },
  { name: 'chromium-nojs', ...NOJS_ONLY, use: { ...devices['Desktop Chrome'], ...NOJS_ONLY.use } },
];

const fullMatrix: Project[] = [
  { name: 'chromium-1024', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...desktop(1024, 768) } },
  { name: 'chromium-390', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...narrow(390, 844) } },
  { name: 'chromium-reduced-motion', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000), contextOptions: { reducedMotion: 'reduce' } } },
];

const realServers = EXAMPLES.map((name) => ({
  command: `node dist/release/bin/explain.cjs serve examples/${name}/index.md --port ${EXAMPLE_PORTS[name]} --dev-toolkit dist/release`,
  url: `http://127.0.0.1:${EXAMPLE_PORTS[name]}/`,
  reuseExistingServer: false,
  timeout: 60_000,
}));

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /.*\.spec\.ts$/,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/playwright.json' }],
    ['junit', { outputFile: 'reports/playwright-junit.xml' }],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
  ],
  outputDir: 'reports/playwright-artifacts',
  use: {
    baseURL,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  metadata: { target },
  projects: full ? [...perCommit, ...fullMatrix] : perCommit,
  webServer:
    target === 'real'
      ? realServers
      : {
          command: 'node tests/browser/fixture-server.mjs --port 4312',
          url: `${baseURL}/contract.html`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
});
