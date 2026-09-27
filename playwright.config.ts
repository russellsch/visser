// Browser tests (§18.4, §18.8).
//
// Target: 'fixture' serves tests/browser/fixtures/contract.html with a freshly
// bundled runtime; 'real' serves the built bounded-queue snapshot through
// `explain serve`. Switch with EXPLAIN_BROWSER_TARGET or DEFAULT_TARGET below.
//
// Tiers (Chromium only, by decision of 27 September 2026): the default
// per-commit tier runs Chromium at 1440 and 320 plus a no-JavaScript project.
// EXPLAIN_BROWSER_TIER=full adds 1024, 390, and reduced motion.
//
// Budgets (§2.3): EXPLAIN_BROWSER_BUDGETS=1 runs only tests/browser/budgets.spec.ts
// against the URL in EXPLAIN_BUDGET_URL, with no web servers and its own
// reports, so the timing run never replaces the tier reports that the contract
// gate reads. scripts/check-budgets.mjs sets these with EXPLAIN_BUDGET_TIMING=1.
// The budgets spec never runs in the default or full tier.
import { defineConfig, devices, type Project } from '@playwright/test';
import { EXAMPLE_PORTS, EXAMPLES } from './tests/browser/examples.ts';

const DEFAULT_TARGET: 'fixture' | 'real' = 'real';
const target = (process.env['EXPLAIN_BROWSER_TARGET'] as 'fixture' | 'real' | undefined) ?? DEFAULT_TARGET;
const full = process.env['EXPLAIN_BROWSER_TIER'] === 'full';
const budgets = process.env['EXPLAIN_BROWSER_BUDGETS'] === '1';
const BUDGETS_SPEC = /budgets\.spec\.ts$/;

const port = target === 'real' ? EXAMPLE_PORTS['bounded-queue'] : 4312;
const baseURL = `http://127.0.0.1:${port}`;

const desktop = (width: number, height: number) => ({ viewport: { width, height } });
const JS_ONLY = { grepInvert: /@nojs/ };
const NOJS_ONLY = { grep: /@nojs/, use: { ...desktop(1440, 1000), javaScriptEnabled: false } };
const narrow = (width: number, height: number) => ({ viewport: { width, height }, isMobile: true, hasTouch: true });

// The exported static site (R10, §13.5): tests/browser/export-site.mjs exports
// every example, and tests/browser/static-server.mjs serves it under a project
// prefix like GitHub Pages. Projects with metadata.site 'export' read it.
const EXPORT_PORT = 4340;
const exportURL = `http://127.0.0.1:${EXPORT_PORT}`;
const EXPORT_SPEC = /export\.spec\.ts$/;
const JOURNEY_SPECS = /(journeys|mermaid|coverage)\.spec\.ts$/;
const exportSite = { metadata: { site: 'export' } };

const perCommit: Project[] = [
  { name: 'chromium-1440', ...JS_ONLY, testIgnore: [EXPORT_SPEC, BUDGETS_SPEC], use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000) } },
  { name: 'chromium-320', ...JS_ONLY, testIgnore: [EXPORT_SPEC, BUDGETS_SPEC], use: { ...devices['Desktop Chrome'], ...narrow(320, 720) } },
  { name: 'chromium-nojs', ...NOJS_ONLY, testIgnore: [EXPORT_SPEC, BUDGETS_SPEC], use: { ...devices['Desktop Chrome'], ...NOJS_ONLY.use } },
  // The export-specific checks run on every commit; the full journeys run on the export in the full tier.
  { name: 'export-1440', ...JS_ONLY, ...exportSite, testMatch: EXPORT_SPEC, use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000), baseURL: exportURL } },
  { name: 'export-nojs', ...NOJS_ONLY, ...exportSite, testMatch: EXPORT_SPEC, use: { ...devices['Desktop Chrome'], ...NOJS_ONLY.use, baseURL: exportURL } },
];

const fullMatrix: Project[] = [
  { name: 'chromium-1024', ...JS_ONLY, testIgnore: [EXPORT_SPEC, BUDGETS_SPEC], use: { ...devices['Desktop Chrome'], ...desktop(1024, 768) } },
  { name: 'chromium-390', ...JS_ONLY, testIgnore: [EXPORT_SPEC, BUDGETS_SPEC], use: { ...devices['Desktop Chrome'], ...narrow(390, 844) } },
  { name: 'chromium-reduced-motion', ...JS_ONLY, testIgnore: [EXPORT_SPEC, BUDGETS_SPEC], use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000), contextOptions: { reducedMotion: 'reduce' } } },
  { name: 'export-journeys-1440', ...JS_ONLY, ...exportSite, testMatch: JOURNEY_SPECS, use: { ...devices['Desktop Chrome'], ...desktop(1440, 1000), baseURL: exportURL } },
  { name: 'export-journeys-320', ...JS_ONLY, ...exportSite, testMatch: JOURNEY_SPECS, use: { ...devices['Desktop Chrome'], ...narrow(320, 720), baseURL: exportURL } },
  { name: 'export-journeys-nojs', ...NOJS_ONLY, ...exportSite, testMatch: JOURNEY_SPECS, use: { ...devices['Desktop Chrome'], ...NOJS_ONLY.use, baseURL: exportURL } },
];

const realServers = EXAMPLES.map((name) => ({
  command: `node dist/release/bin/explain.cjs serve examples/${name}/index.md --port ${EXAMPLE_PORTS[name]} --dev-toolkit dist/release`,
  url: `http://127.0.0.1:${EXAMPLE_PORTS[name]}/`,
  reuseExistingServer: false,
  timeout: 60_000,
}));

const exportServer = {
  command: `node tests/browser/export-site.mjs && node tests/browser/static-server.mjs --dir reports/export-site/site --prefix /explain-demo/ --port ${EXPORT_PORT}`,
  url: `${exportURL}/explain-demo/`,
  reuseExistingServer: false,
  timeout: 120_000,
};

const budgetProjects: Project[] = [{ name: 'budgets', testMatch: BUDGETS_SPEC, use: { ...devices['Desktop Chrome'], screenshot: 'off', trace: 'off' } }];

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /.*\.spec\.ts$/,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: budgets
    ? [['list'], ['json', { outputFile: 'reports/budgets-playwright.json' }]]
    : [
        ['list'],
        ['json', { outputFile: 'reports/playwright.json' }],
        ['junit', { outputFile: 'reports/playwright-junit.xml' }],
        ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
      ],
  outputDir: budgets ? 'reports/budgets-artifacts' : 'reports/playwright-artifacts',
  use: {
    baseURL,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  metadata: { target },
  projects: budgets ? budgetProjects : full ? [...perCommit, ...fullMatrix] : perCommit,
  webServer: budgets
    ? undefined
    : target === 'real'
      ? [...realServers, exportServer]
      : {
          command: 'node tests/browser/fixture-server.mjs --port 4312',
          url: `${baseURL}/contract.html`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
});
