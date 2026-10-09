import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
// @ts-expect-error jsdom is supplied by the browser-test harness.
import { JSDOM } from 'jsdom';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';

type Fixture = { html: string; rows: unknown[] };
const fields = ['tr_t', 'tr_q', 'tr_b', 'tr_a', 'tr_e', 'tr_l', 'tr_c', 'tr_u', 'tr_p', 'tr_entity', 'tr_pre'] as const;
const nativeFields = { tr_a: 1, tr_p: 2, tr_e: 1, tr_l: 1, tr_u: 3 } as const;
const longTex = (tex: string) => `${tex}+x_{${'a'.repeat(120)}}`;
const fixtures = new Map<boolean, Fixture>();
let runtime: string;
let worker: string;

function traceSource(math: (tex: string) => string): string {
  return `{% graph id="context" mode="architecture" title="Context" question="Why?" %}
{% node id="entity" role="process" label="Entity ${math('tr_entity')}" /%}
{% /graph %}

{% trace id="trace" title="Trace ${math('tr_t')}" question="Question ${math('tr_q')}?" scale="time" timeUnit="${math('tr_u')}" %}
Body ${math('tr_b')}.
{% actor id="actor" label="Actor ${math('tr_a')}" entity="entity" /%}
{% actor id="peer" label="Peer ${math('tr_p')}" /%}
{% branch id="branch" label="Branch ${math('tr_l')}" condition="if ${math('tr_c')}" exclusiveWith=["alternate"] /%}
{% branch id="alternate" label="Alternate" condition="otherwise" exclusiveWith=["branch"] /%}
{% event id="start" actor="actor" label="Start ${math('tr_pre')}" kind="compute" time=1 /%}
{% event id="event" actor="actor" to="peer" label="Event ${math('tr_e')}" kind="call" time=2 branch="branch" after=["start"] /%}
{% event id="other" actor="actor" label="Other" kind="failure" time=3 branch="alternate" after=["start"] /%}
{% /trace %}`;
}

function tex(raw: string, long: boolean): string {
  return `$${long ? longTex(raw) : raw}$`;
}

test.beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), 'visser-trace-field-math-'));
  try {
    const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
    for (const long of [false, true]) {
      const path = join(directory, `trace-${long}.md`);
      writeFileSync(path, `---${frontmatter}---\n\n${traceSource(raw => tex(raw, long))}`);
      const bundle = loadBundle(path);
      expect(bundle.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
      const compiled = await compileDocument(bundle, { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } }, { audience: 'private', includeSource: false, layoutFallback: false });
      const markdown = new TextDecoder().decode(compiled.files.find(file => file.path.endsWith('/document.md'))!.bytes);
      for (const line of [
        `**trace: Trace ${tex('tr_t', long)}**`, `Question: Question ${tex('tr_q', long)}?`,
        `Body ${tex('tr_b', long)}.`, `Time scale: ${tex('tr_u', long)}.`,
        `Actor Actor ${tex('tr_a', long)} (entity: entity)`,
        `Event Event ${tex('tr_e', long)} (call; actor: Actor ${tex('tr_a', long)})`,
        `Actor ${tex('tr_a', long)} --[message; Event ${tex('tr_e', long)}]--> Peer ${tex('tr_p', long)}`,
        `after: Start ${tex('tr_pre', long)} (start)`, `Branch Branch ${tex('tr_l', long)}`,
        `condition: if ${tex('tr_c', long)}`, 'branch: branch',
      ]) expect(markdown).toContain(line);
      for (const [label, kind, time] of [[`Start ${tex('tr_pre', long)}`, 'compute', 1], [`Event ${tex('tr_e', long)}`, 'call', 2], ['Other', 'failure', 3]] as const) {
        const eventSection = markdown.split(`Event ${label} (${kind}; actor: Actor ${tex('tr_a', long)})`)[1]!.split('\nEvent ')[0]!;
        expect(eventSection).toContain(`time: ${time}`);
      }
      const document = new JSDOM(new TextDecoder().decode(compiled.files.find(file => file.path.endsWith('/index.html'))!.bytes)).window.document;
      for (const selector of ['.vs-trace-events', '.vs-trace-cards']) {
        const times = [...document.querySelectorAll(`${selector} .vs-event-time`)].map((node: Element) => node.textContent);
        expect(times).toEqual([1, 2, 3].map(time => ` at ${time} ${tex('tr_u', long)}`));
      }
      for (const [id, time] of [['start', 1], ['event', 2], ['other', 3]] as const) {
        const box = document.querySelector(`.vs-event-box[data-vs-target="${id}"]`)!;
        const timeLines = [...box.querySelectorAll('.vs-trace-time')];
        expect(timeLines.map((node: Element) => node.textContent).join('')).toContain(`at ${time}`);
        const slots = timeLines.flatMap((node: Element) => [...node.querySelectorAll('[data-vs-math-native]')]);
        expect(slots).toHaveLength(1);
        expect(slots[0]!.getAttribute('data-vs-math-key')).toBe(JSON.stringify([false, long ? longTex('tr_u') : 'tr_u']));
      }
      for (const selector of ['.vs-lane[data-vs-target="peer"] .vs-lane-label', '.vs-event-box[data-vs-target="event"] .vs-trace-meta']) {
        const peerSlots = [...document.querySelectorAll(`${selector} [data-vs-math-native]`)].filter((node: Element) => node.getAttribute('data-vs-math-key') === JSON.stringify([false, long ? longTex('tr_p') : 'tr_p']));
        expect(peerSlots, selector).toHaveLength(1);
      }
      const rows = JSON.parse(document.querySelector('meta[name="vs-math-expressions"]')!.getAttribute('content')!);
      document.querySelectorAll('script, link, meta[http-equiv]').forEach((node: Element) => node.remove());
      document.querySelectorAll('details').forEach((node: Element) => node.setAttribute('open', ''));
      const style = document.createElement('style');
      style.textContent = readFileSync('packages/runtime/src/reader.css', 'utf8');
      document.head.append(style);
      fixtures.set(long, { html: document.documentElement.outerHTML, rows });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const built = await Promise.all([
    build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'VSTraceFields', write: false }),
    build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser', format: 'iife', write: false }),
  ]);
  runtime = built[0]!.outputFiles[0]!.text;
  worker = built[1]!.outputFiles[0]!.text;
});

for (const mode of ['success', 'nojs', 'failure', 'long', 'print'] as const) {
  test(`trace retains COV18–19 fields in ${mode} @M02 @M03 @M10 @M13${mode === 'nojs' ? ' @nojs' : ''}`, async ({ page }) => {
    const long = mode === 'long';
    const fixture = fixtures.get(long)!;
    await page.setContent(fixture.html);
    if (mode !== 'nojs') {
      await page.addScriptTag({ content: runtime });
      const status = await page.evaluate(async ({ source, rows }) => (window as any).VSTraceFields.initializeMath(document, source, rows), {
        source: mode === 'failure' ? 'throw new Error("deliberate worker failure")' : worker,
        rows: fixture.rows,
      });
      if (mode === 'failure') expect(status.failed).toBeGreaterThan(0);
      else expect(status.failed).toBe(0);
    }
    if (mode === 'print') await page.emulateMedia({ media: 'print' });

    const figure = page.locator('#x-trace');
    for (const raw of fields) {
      const scope = raw === 'tr_c' ? page.locator('#x-branch .vs-facts dt:text-is("condition") + dd') : figure;
      const source = scope.locator('.vs-math-source').filter({ hasText: tex(raw, long) });
      expect(await source.count(), raw).toBeGreaterThan(0);
      if (mode === 'success' || mode === 'long') {
        for (const node of await source.all()) {
          const math = node.locator('..');
          await expect(math).toHaveAttribute('data-vs-math-rendered', '');
          await expect(math.locator('.vs-math-visual svg')).toHaveCount(1);
          if (await node.isVisible()) await expect(math.locator('.vs-math-visual svg')).toBeVisible();
        }
      } else {
        expect(await scope.locator('.vs-math-source:visible').filter({ hasText: tex(raw, long) }).count()).toBeGreaterThan(0);
        for (const node of await source.all()) {
          expect(await node.evaluate(element => getComputedStyle(element).clipPath)).toBe('none');
          await expect(node.locator('..').locator('.vs-math-visual')).toBeHidden();
        }
      }
    }

    await expect(figure).toHaveAttribute('aria-label', `Figure: Trace ${tex('tr_t', long)}`);
    await expect(figure).toHaveAttribute('aria-describedby', 'vs-q-trace');
    await expect(figure.locator(':scope > .vs-figure-lead > .vs-figure-text > p .vs-math-source')).toHaveText(tex('tr_b', long));
    for (const raw of ['tr_a', 'tr_p']) {
      for (const selector of ['.vs-actor-list', '.vs-actor-heading']) {
        await expect(figure.locator(`${selector} .vs-math-source`).filter({ hasText: tex(raw, long) })).toHaveText(tex(raw, long));
      }
    }
    await expect(figure.locator('figcaption .vs-math-source').filter({ hasText: tex('tr_t', long) })).toHaveText(tex('tr_t', long));
    await expect(figure.locator('[id="vs-q-trace"] .vs-math-source').filter({ hasText: tex('tr_q', long) })).toHaveText(tex('tr_q', long));
    await expect(figure.locator('.vs-trace-scale .vs-math-source').filter({ hasText: tex('tr_u', long) })).toHaveText(tex('tr_u', long));
    await expect(figure.locator('.vs-actor-list .vs-math-source').filter({ hasText: tex('tr_a', long) })).toHaveText(tex('tr_a', long));
    await expect(figure.locator('.vs-branch-list .vs-math-source').filter({ hasText: tex('tr_l', long) })).toHaveText(tex('tr_l', long));
    await expect(figure.locator('.vs-trace-events .vs-math-source').filter({ hasText: tex('tr_e', long) })).toHaveText(tex('tr_e', long));
    for (const source of await figure.locator('.vs-trace-events .vs-event-time .vs-math-source').filter({ hasText: tex('tr_u', long) }).all()) await expect(source).toHaveText(tex('tr_u', long));
    await expect(figure.locator('.vs-trace-cards .vs-math-source').filter({ hasText: tex('tr_e', long) })).toHaveText(tex('tr_e', long));
    for (const source of await figure.locator('.vs-trace-cards .vs-event-time .vs-math-source').filter({ hasText: tex('tr_u', long) }).all()) await expect(source).toHaveText(tex('tr_u', long));
    await expect(page.locator('#x-branch .vs-facts dt:text-is("condition") + dd .vs-math-source').filter({ hasText: tex('tr_c', long) })).toHaveText(tex('tr_c', long));
    for (const [selector, raw] of [
      ['.vs-actor-list .vs-entity', 'tr_entity'], ['.vs-actor-heading .vs-entity', 'tr_entity'],
      ['.vs-trace-events .vs-actor', 'tr_a'],
      ['.vs-trace-events .vs-message-to', 'tr_p'], ['.vs-trace-cards .vs-message-to', 'tr_p'],
      ['.vs-trace-events .vs-event-branch', 'tr_l'], ['.vs-trace-cards .vs-event-branch', 'tr_l'],
      ['.vs-trace-events .vs-after', 'tr_pre'], ['.vs-trace-cards .vs-after', 'tr_pre'],
    ]) {
      const copies = figure.locator(`${selector} .vs-math-source`).filter({ hasText: tex(raw!, long) });
      expect(await copies.count(), selector).toBeGreaterThan(0);
      for (const copy of await copies.all()) await expect(copy).toHaveText(tex(raw!, long));
    }

    const native = figure.locator('[data-vs-math-native]');
    if (mode === 'success' || mode === 'long') {
      await expect(figure.locator('.vs-viewport')).toBeVisible();
      for (const [raw, count] of Object.entries(nativeFields)) {
        const key = JSON.stringify([false, long ? longTex(raw) : raw]);
        const slots = [];
        for (const slot of await native.all()) if (await slot.getAttribute('data-vs-math-key') === key) slots.push(slot);
        expect(slots.length, raw).toBe(count);
        for (const slot of slots) {
          await expect(slot).toHaveAttribute('data-vs-math-rendered', '');
          await expect(slot.locator(':scope > svg')).toBeVisible();
        }
      }
    } else {
      await expect(figure.locator('.vs-viewport')).toBeHidden();
    }
  });
}
