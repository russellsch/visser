// Browser tests (§18.4, §18.8).
//
// Target: 'fixture' serves tests/browser/fixtures/contract.html with a freshly
// bundled runtime; 'real' serves the built bounded-queue snapshot through
// `explain serve`. Switch with EXPLAIN_BROWSER_TARGET or DEFAULT_TARGET below.
//
// Tiers: the default (per-commit) tier runs Chromium at 1440 and 320 plus a
// no-JavaScript project. EXPLAIN_BROWSER_TIER=full adds the applicable matrix
// (Firefox and WebKit need their browser binaries installed first).
import { defineConfig, devices, type Project } from '@playwright/test';

const DEFAULT_TARGET: 'fixture' | 'real' = 'real';
const target = (process.env['EXPLAIN_BROWSER_TARGET'] as 'fixture' | 'real' | undefined) ?? DEFAULT_TARGET;
const full = process.env['EXPLAIN_BROWSER_TIER'] === 'full';

const port = target === 'real' ? 4311 : 4312;
const baseURL = `http://127.0.0.1:${port}`;

const desktop = (width: number, height: number) => ({ viewport: { width, height } });
const JS_ONLY = { grepInvert: /@nojs/ };
const NOJS_ONLY = { grep: /@nojs/, use: { ...desktop(1440, 1000), javaScriptEnabled: false } };

const perCommit: Project[] = [
  { name: 'chromium-1440', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000) } },
  { name: 'chromium-320', ...JS_ONLY, use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true } },
  { name: 'chromium-nojs', ...NOJS_ONLY, use: { ...devices['Desktop Chrome'], ...NOJS_ONLY.use } },
];

const fullMatrix: Project[] = [
  ...(['firefox', 'webkit'] as const).flatMap((engine) => {
    const device = engine === 'firefox' ? devices['Desktop Firefox'] : devices['Desktop Safari'];
    return [
      { name: `${engine}-1440`, ...JS_ONLY, use: { ...device, ...desktop(1440, 1000) } },
      { name: `${engine}-1024`, ...JS_ONLY, use: { ...device, ...desktop(1024, 768) } },
      { name: `${engine}-nojs`, ...NOJS_ONLY, use: { ...device, ...NOJS_ONLY.use } },
    ];
  }),
  { name: 'chromium-1024', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...desktop(1024, 768) } },
  { name: 'chromium-390', ...JS_ONLY, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { name: 'webkit-390', ...JS_ONLY, use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  { name: 'webkit-320', ...JS_ONLY, use: { ...devices['Desktop Safari'], viewport: { width: 320, height: 720 }, hasTouch: true } },
  { name: 'chromium-reduced-motion', ...JS_ONLY, use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000), contextOptions: { reducedMotion: 'reduce' } } },
];

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
      ? {
          command: 'node dist/release/bin/explain.cjs serve examples/bounded-queue/index.md --port 4311 --dev-toolkit dist/release',
          url: `${baseURL}/`,
          reuseExistingServer: false,
          timeout: 60_000,
        }
      : {
          command: 'node tests/browser/fixture-server.mjs --port 4312',
          url: `${baseURL}/contract.html`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
});
