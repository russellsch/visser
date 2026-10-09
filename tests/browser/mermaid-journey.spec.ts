import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The checked build plugin has no TypeScript declaration.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const plain = 'journey\ntitle Plain journey\nsection Plan\nFirst: 3: Alice\nSecond: 4: Bob\n';
const math = String.raw`journey
title Journey $$\frac{a}{b}$$
section Section $$\rlap{\rule{20em}{1em}}s$$<br>literal-section
Tall $$\begin{matrix}a&b\\c&d\end{matrix}$$<br>literal-task: -2: Actor $$\frac{a}{b}$$<br/>tooltip, __proto__, constructor, __proto__, 
Next $$\rule{1em}{10em}$$: 8
`;

let bundle: string;
let upstreamBundle: string;
test.beforeAll(async () => {
  const options = { bundle: true, platform: 'browser' as const, format: 'iife' as const, minify: true, write: false as const };
  bundle = (await build({ ...options, stdin: { resolveDir: root, sourcefile: 'mermaid-journey-entry.ts', contents: `
    import './packages/runtime/src/mermaid-bundle.ts';
    import { createJourneyMathRenderer } from './packages/runtime/src/mermaid-journey.ts';
    globalThis.journeyMathHooks = { createJourneyMathRenderer };
  ` },
    plugins: [mermaidMathPlugin(root)] })).outputFiles[0]!.text;
  upstreamBundle = (await build({ ...options, stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaidOriginal = mermaid;",
    resolveDir: root, sourcefile: 'mermaid-original.js' } })).outputFiles[0]!.text;
});

const config = { startOnLoad: false, securityLevel: 'strict', theme: 'base', deterministicIds: true,
  themeVariables: { fontFamily: 'Arial, sans-serif', fontSize: '14px' }, journey: { useMaxWidth: false } };

test('plain journey keeps upstream views, tasks, sections, and native single-read behavior', async ({ page }) => {
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  await page.addScriptTag({ content: upstreamBundle });
  const result = await page.evaluate(async ({ source, config }) => {
    const host = document.getElementById('rendered')!;
    const summary = (markup: string) => {
      host.innerHTML = markup;
      const svg = host.querySelector('svg')!;
      return { viewBox: svg.getAttribute('viewBox'), foreign: svg.querySelectorAll('foreignObject').length,
        sections: [...svg.querySelectorAll('.journey-section, .section')].map(node => node.getAttribute('d') ?? node.getAttribute('width')),
        tasks: [...svg.querySelectorAll('.task, .task-line, .face')].map(node => [node.tagName, node.getAttribute('cx'), node.getAttribute('cy'), node.getAttribute('x'), node.getAttribute('y')]),
        text: [...svg.querySelectorAll('text')].map(node => node.textContent), staged: svg.querySelectorAll('.vs-journey-math').length };
    };
    const patched = (window as any).mermaid, original = (window as any).mermaidOriginal;
    patched.initialize(config); original.initialize(config);
    const first = await patched.render('journey-plain-patched', source);
    const patchedSummary = summary(first.svg);
    const second = await original.render('journey-plain-original', source);
    return { patched: patchedSummary, original: summary(second.svg) };
  }, { source: plain, config });
  expect(result.patched).toEqual(result.original);
  expect(result.patched.staged).toBe(0);
  const reads = await page.evaluate(async () => {
    const create = (window as any).journeyMathHooks.createJourneyMathRenderer;
    let taskReads = 0; let forwarded: unknown;
    const tasks = [{ task: 'plain', section: '', people: [], score: 3 }];
    const draw = create({ original: async (_text: string, _id: string, _version: string, diagram: any) => { forwarded = diagram.db.getTasks(); },
      getConfig: () => ({}), select: () => undefined, initGraphics: () => undefined, drawFace: () => undefined,
      drawCircle: () => undefined, configureSvgSize: () => undefined });
    await draw('', 'unused', '', { db: { getTasks: () => { taskReads++; return tasks; }, getActors: () => [], getDiagramTitle: () => '' } });
    return { taskReads, forwarded };
  });
  expect(reads).toEqual({ taskReads: 1, forwarded: [{ task: 'plain', section: '', people: [], score: 3 }] });
});

test('journey math measures all visible roles, retains literal task breaks, and contains ink', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async ({ source, config }) => {
    const mermaid = (window as any).mermaid; mermaid.initialize(config);
    const rendered = await mermaid.render('journey-math', source);
    document.getElementById('rendered')!.innerHTML = rendered.svg;
    const svg = document.querySelector<SVGSVGElement>('#rendered svg')!;
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; };
    const labels = [...svg.querySelectorAll<SVGForeignObjectElement>('foreignObject[data-vs-mermaid-label]')].map(label => {
      const parent = label.closest('.journey-task-wrapper, .journey-section-wrapper')?.querySelector('rect');
      return { key: label.getAttribute('data-vs-mermaid-label'), text: label.textContent,
        box: rect(label), parent: parent ? rect(parent) : undefined,
        ink: [...label.querySelectorAll('math, math *')].map(rect).filter(box => box.right > box.left && box.bottom > box.top) };
    });
    const faces = [...svg.querySelectorAll<SVGCircleElement>('circle.face')].map(face => Number(face.getAttribute('cy')));
    const actorCircles = [...svg.querySelectorAll<SVGCircleElement>('circle[class^="actor-"]')];
    const geometry = [...svg.querySelectorAll<SVGElement>('circle, .journey-axis, .task-line, .journey-section-wrapper rect, .journey-task-wrapper rect')].map(rect);
    const sections = [...svg.querySelectorAll<SVGGElement>('.journey-section-wrapper')].map(wrapper => rect(wrapper.querySelector('rect')!));
    const tasks = [...svg.querySelectorAll<SVGGElement>('.journey-task-wrapper')].map(wrapper => rect(wrapper.querySelector('rect')!));
    return { viewBox: (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number), viewport: rect(svg), labels,
      math: svg.querySelectorAll('math').length, faces, actorCircleCount: actorCircles.length,
      actorTooltips: actorCircles.map(circle => circle.querySelector('title')?.textContent).filter(Boolean), geometry, sections, tasks,
      staged: svg.querySelectorAll('.vs-journey-math').length };
  }, { source: math, config });
  expect(result.viewBox).toHaveLength(4);
  expect(result.viewBox.every(Number.isFinite)).toBe(true);
  expect(result.viewBox[2]).toBeGreaterThan(0);
  expect(result.viewBox[3]).toBeGreaterThan(0);
  expect(result.staged).toBe(1);
  expect(result.math).toBeGreaterThanOrEqual(5);
  expect(result.labels.map(label => label.key).sort()).toEqual([
    'title', 'actor:0', 'actor:1', 'actor:2', 'actor:3', 'section:0', 'task:0', 'task:1',
  ].sort());
  const section = result.labels.find(label => label.key === 'section:0')!;
  const task = result.labels.find(label => label.key === 'task:0')!;
  const actor = result.labels.find(label => label.key === 'actor:1')!;
  expect(section.text).toContain('<br>literal-section');
  expect(task.text).toContain('<br>literal-task');
  expect(actor.text).not.toContain('<br/>');
  expect(actor.text).toContain(' tooltip');
  expect(result.actorTooltips).toContain('Actor $$\\frac{a}{b}$$<br/>tooltip');
  // Four legend entries plus five task-owner circles, including the duplicate
  // prototype-like name and empty owner.
  expect(result.actorCircleCount).toBe(9);
  expect(Math.abs(result.faces[0]! - result.faces[1]!)).toBeCloseTo(300, 4);
  const contains = (outer: typeof result.viewport, inner: typeof result.viewport) =>
    inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  for (const label of result.labels) {
    expect(contains(result.viewport, label.box), `${label.key} stays in SVG`).toBe(true);
    if (label.parent) expect(contains(label.parent, label.box), `${label.key} stays in its rectangle`).toBe(true);
    for (const ink of label.ink) expect(contains(label.box, ink), `${label.key} math ink stays in its foreign object`).toBe(true);
  }
  for (const shape of result.geometry) expect(contains(result.viewport, shape), 'journey geometry stays in SVG').toBe(true);
  for (let index = 1; index < result.tasks.length; index++) {
    const prior = result.tasks[index - 1]!, current = result.tasks[index]!;
    expect(current.left, 'task rectangles do not overlap').toBeGreaterThanOrEqual(prior.right + 1);
  }
  for (const sectionBox of result.sections) for (const taskBox of result.tasks) {
    expect(taskBox.top, 'task rows clear their section row').toBeGreaterThanOrEqual(sectionBox.bottom + 1);
  }
});

test('journey math failure leaves no staged group and a later render recovers', async ({ page }) => {
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async ({ config }) => {
    const mermaid = (window as any).mermaid; mermaid.initialize(config);
    const host = document.getElementById('rendered')!; let failed = false;
    try { await mermaid.render('journey-fail', 'journey\nTask $$\\unknownVisserCommand$$: 3\n'); } catch { failed = true; }
    const staleAfterFailure = document.querySelectorAll('.vs-journey-math').length;
    host.innerHTML = (await mermaid.render('journey-recovered', 'journey\nTask $$x$$: 3\n')).svg;
    return { failed, staleAfterFailure, staged: host.querySelectorAll('.vs-journey-math').length,
      labels: [...host.querySelectorAll('[data-vs-mermaid-label]')].map(node => node.getAttribute('data-vs-mermaid-label')) };
  }, { config });
  expect(result).toEqual({ failed: true, staleAfterFailure: 0, staged: 1, labels: ['task:0'] });
});

test('numeric actor legend order keeps sorted source keys and native integer-key visual order', async ({ page }) => {
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async ({ config }) => {
    const mermaid = (window as any).mermaid; mermaid.initialize(config);
    const source = 'journey\ntitle $$t$$\nTask $$x$$: 3: 10, 2, __proto__\n';
    document.getElementById('rendered')!.innerHTML = (await mermaid.render('journey-numeric-actors', source)).svg;
    const svg = document.querySelector<SVGSVGElement>('#rendered svg')!;
    const legend = [...svg.querySelectorAll<SVGCircleElement>('.vs-journey-math > circle[class^="actor-"]')]
      .map(circle => ({ klass: circle.getAttribute('class'), fill: circle.getAttribute('fill'), cy: Number(circle.getAttribute('cy')) }));
    const task = [...svg.querySelectorAll<SVGCircleElement>('.journey-task-wrapper circle[class^="actor-"]')]
      .map(circle => ({ klass: circle.getAttribute('class'), fill: circle.getAttribute('fill'), title: circle.querySelector('title')?.textContent }));
    const labels = [...svg.querySelectorAll('[data-vs-mermaid-label^="actor:"]')]
      .map(label => [label.getAttribute('data-vs-mermaid-label'), label.textContent]);
    return { legend, task, labels };
  }, { config });
  expect(result.labels).toEqual([['actor:1', '2'], ['actor:0', '10'], ['actor:2', '__proto__']]);
  expect(result.legend.map(circle => circle.klass)).toEqual(['actor-1', 'actor-0', 'actor-2']);
  // The DOM order follows native Object.keys integer enumeration, while the
  // assigned positions and colours retain the sorted DB identities.
  expect(result.legend[0]!.cy).toBeLessThan(result.legend[1]!.cy);
  expect(result.task.map(circle => circle.title)).toEqual(['10', '2', '__proto__']);
  expect(result.task.map(circle => circle.fill)).toEqual([
    result.legend[1]!.fill, result.legend[0]!.fill, result.legend[2]!.fill,
  ]);
});
