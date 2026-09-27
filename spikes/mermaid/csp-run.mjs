// Render each CSP variant in Chromium; record violations, errors, times, and screenshots.
import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const port = 4600;
const server = spawn(process.execPath, ['serve.mjs', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch();
const results = {};
for (const variant of process.argv.slice(2).length ? process.argv.slice(2) : ['strict', 'nohtml', 'inline']) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  const console_ = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console_.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => console_.push('PAGEERROR ' + String(e).slice(0, 140)));
  await page.goto(`http://127.0.0.1:${port}/${variant}/`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
  const data = await page.evaluate(() => ({ csp: window.__csp, times: window.__times, errors: Object.entries(window.__svgs).filter(([, s]) => s.startsWith('ERROR')).map(([n, s]) => [n, s.slice(0, 120)]) }));
  const byDirective = {};
  for (const v of data.csp) byDirective[v.directive] = (byDirective[v.directive] ?? 0) + 1;
  results[variant] = { violations: byDirective, samples: [...new Set(data.csp.map((v) => `${v.directive} ${v.blocked}`))].slice(0, 6), times: data.times, renderErrors: data.errors, console: [...new Set(console_)].slice(0, 5) };
  await page.screenshot({ path: `shots/${variant}.png`, fullPage: true });
  await page.close();
}
await browser.close();
server.kill();
console.log(JSON.stringify(results, null, 1));
