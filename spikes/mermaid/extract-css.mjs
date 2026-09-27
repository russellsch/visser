// Collect the <style> text Mermaid generated in the inline run into one same-origin stylesheet.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const server = spawn(process.execPath, ['serve.mjs', '4601'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:4601/inline/');
await p.waitForFunction(() => window.__done === true);
const css = await p.evaluate(() => Object.values(window.__svgs).map((s) => (s.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '').join('\n'));
writeFileSync('site/mermaid-generated.css', css);
console.log('css bytes', css.length);
await b.close(); server.kill();
