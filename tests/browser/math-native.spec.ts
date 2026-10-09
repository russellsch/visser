import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { convertMath } from '../../packages/core/src/math/engine.ts';

type Expression = { key: string; tex: string; display: boolean };
const expressions: Expression[] = [
  { key: 'fraction', tex: '\\frac{a}{b}', display: false },
  { key: 'matrix', tex: '\\begin{matrix}a&b\\\\c&d\\end{matrix}', display: false },
];
let runtimeSource: string;
let workerSource: string;

test.beforeAll(async () => {
  const [runtime, worker] = await Promise.all([
    build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser',
      format: 'iife', globalName: 'VSNative', minify: true, write: false }),
    build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser',
      format: 'iife', minify: true, write: false }),
  ]);
  runtimeSource = runtime.outputFiles[0]!.text;
  workerSource = worker.outputFiles[0]!.text;
});

function slot(record: Expression, x: number, baseline: number): string {
  const metric = convertMath(record.tex, record.display).metrics;
  const y = baseline - metric.ascentEm * 14;
  return `<svg data-vs-math-native data-vs-math-key="${record.key}" x="${x}" y="${y}" width="${Math.ceil(metric.widthEm * 14)}" height="${Math.ceil(metric.heightEm * 14)}" data-baseline="${baseline}" data-depth="${metric.depthEm}"></svg>`;
}

test('native math slots fill reserved 14px geometry and preserve the full source list', async ({ page }) => {
  await page.setContent(`<style>figure[data-vs-math-figure]:not([data-vs-math-ready]) > svg{display:none}</style>
    <figure data-vs-math-figure><svg width="400" height="220"><g data-vs-target="graph-node">
    ${slot(expressions[0]!, 12, 80)}${slot(expressions[1]!, 90, 130)}
    </g></svg><ul><li>fraction source</li><li>matrix source</li></ul></figure>`);
  await page.addScriptTag({ content: runtimeSource });
  const status = await page.evaluate(async ({ worker, rows }) =>
    (window as any).VSNative.initializeMath(document, worker, rows), { worker: workerSource, rows: expressions });
  expect(status).toEqual({ rendered: 2, failed: 0, skipped: 0 });
  const observation = await page.evaluate(() => {
    const figure = document.querySelector('figure')!;
    const parent = figure.querySelector('svg')!;
    const parentRect = parent.getBoundingClientRect();
    return {
      ready: figure.hasAttribute('data-vs-math-ready'),
      list: figure.querySelector('ul')?.textContent,
      parentDisplay: getComputedStyle(parent).display,
      slots: Array.from(figure.querySelectorAll('[data-vs-math-native]')).map(slot => {
        const glyph = slot.firstElementChild as SVGElement;
        const rect = slot.getBoundingClientRect();
        const originY = (slot as SVGSVGElement).getScreenCTM()!.f;
        const viewportBottom = originY + Number(slot.getAttribute('height'));
        const baseline = Number(slot.getAttribute('data-baseline'));
        const depth = Number(slot.getAttribute('data-depth'));
        return {
          children: slot.children.length, localName: glyph?.localName,
          glyphWidth: glyph?.getAttribute('width'), slotWidth: slot.getAttribute('width'),
          glyphHeight: glyph?.getAttribute('height'), slotHeight: slot.getAttribute('height'),
          x: glyph?.getAttribute('x'), y: glyph?.getAttribute('y'),
          baselineError: Math.abs((viewportBottom - parentRect.top) - (baseline + depth * 14)),
          inkInside: rect.top >= originY - 0.1 && rect.bottom <= viewportBottom + 0.1,
          target: slot.closest('[data-vs-target]')?.getAttribute('data-vs-target'),
          hasHtml: !!slot.querySelector('span,button,foreignObject'),
          hasId: !!slot.querySelector('[id]'),
        };
      }),
    };
  });
  expect(observation.ready).toBe(true);
  expect(observation.parentDisplay).not.toBe('none');
  expect(observation.list).toContain('matrix source');
  for (const item of observation.slots) {
    expect(item.children).toBe(1);
    expect(item.localName).toBe('svg');
    expect(item.glyphWidth).toBe(item.slotWidth);
    expect(item.glyphHeight).toBe(item.slotHeight);
    expect(item.x).toBe('0');
    expect(item.y).toBe('0');
    expect(item.baselineError).toBeLessThan(1);
    expect(item.inkInside).toBe(true);
    expect(item.target).toBe('graph-node');
    expect(item.hasHtml).toBe(false);
    expect(item.hasId).toBe(false);
  }
  const repeat = await page.evaluate(async ({ worker, rows }) =>
    (window as any).VSNative.initializeMath(document, worker, rows), { worker: workerSource, rows: expressions });
  expect(repeat).toEqual({ rendered: 0, failed: 0, skipped: 2 });
});

test('one failed native slot keeps the drawing hidden and the list readable', async ({ page }) => {
  const good = expressions[0]!;
  const bad = { key: 'bad', tex: '\\notacommand{x}', display: false };
  await page.setContent(`<style>figure[data-vs-math-figure]:not([data-vs-math-ready]) > svg{display:none}</style>
    <figure data-vs-math-figure><svg width="400" height="220">${slot(good, 12, 80)}
    <svg data-vs-math-native data-vs-math-key="bad" x="90" y="90" width="30" height="20"></svg>
    </svg><ul><li>complete source list</li></ul></figure>`);
  await page.addScriptTag({ content: runtimeSource });
  const status = await page.evaluate(async ({ worker, rows }) =>
    (window as any).VSNative.initializeMath(document, worker, rows), { worker: workerSource, rows: [good, bad] });
  expect(status).toEqual({ rendered: 1, failed: 1, skipped: 0 });
  const figure = page.locator('figure');
  await expect(figure).not.toHaveAttribute('data-vs-math-ready', '');
  await expect(figure.locator(':scope > svg')).toBeHidden();
  await expect(figure.locator('ul')).toBeVisible();
  await expect(figure.locator('ul')).toContainText('complete source list');
  await expect(figure.locator('[data-vs-math-key="bad"] > *')).toHaveCount(0);
});
