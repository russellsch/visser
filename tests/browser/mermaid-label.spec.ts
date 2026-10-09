import { build } from 'esbuild';
import { test, expect } from '@playwright/test';

let bundle: string;
test.beforeAll(async () => {
  const result = await build({ entryPoints: ['packages/runtime/src/mermaid-label.ts'], bundle: true,
    format: 'iife', globalName: 'LabelTest', write: false });
  bundle = result.outputFiles[0]!.text;
});

test('Mermaid labels measure the placed MathML in local SVG units', async ({ page }) => {
  await page.setContent('<!doctype html><style>.legend text{font-size:20px;font-family:serif;fill:rgb(20,30,40)}</style>' +
    '<svg width="600" height="400" viewBox="0 0 300 200"><svg class="legend" id="context"></svg></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('#context') as SVGSVGElement;
    const source = 'Ω rate $$\\frac{a}{b}$$<br>$$\\begin{matrix}a&b\\\\c&d\\end{matrix}$$';
    const measured = await (window as any).LabelTest.measureMermaidLabel(svg, source, '');
    const placed = measured.place(svg, 10, 20);
    const rect = placed.getBoundingClientRect();
    const div = placed.querySelector('div')!;
    return { width: measured.width, height: measured.height, screenWidth: rect.width, screenHeight: rect.height,
      fontSize: getComputedStyle(div).fontSize, color: getComputedStyle(div).color,
      math: placed.querySelectorAll('math').length, fractions: placed.querySelectorAll('mfrac').length,
      rows: placed.querySelectorAll('mtr').length, breaks: placed.querySelectorAll('br').length,
      foreignObjects: svg.querySelectorAll('foreignObject').length };
  });
  expect(result.math).toBe(2);
  expect(result.fractions).toBe(1);
  expect(result.rows).toBe(2);
  expect(result.breaks).toBe(1);
  expect(result.fontSize).toBe('20px');
  expect(result.color).toBe('rgb(20, 30, 40)');
  expect(result.height).toBeGreaterThan(50);
  expect(result.screenWidth).toBeCloseTo(2 * result.width, 1);
  expect(result.screenHeight).toBeCloseTo(2 * result.height, 1);
  expect(result.foreignObjects).toBe(1);
});

test('Mermaid labels reject invalid math and keep ordinary markup inert', async ({ page }) => {
  await page.setContent('<!doctype html><svg width="400" height="200"></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('svg')!;
    const api = (window as any).LabelTest;
    const label = await api.measureMermaidLabel(svg, '<img src="https://example.invalid/x">', '');
    const placed = label.place(svg, 0, 0);
    const errors: string[] = [];
    for (const text of ['$$\\notacommand{x}$$', '$$\\href{https://example.invalid}{x}$$', '$$x']) {
      try { await api.measureMermaidLabel(svg, text, ''); }
      catch (error) { errors.push(String(error)); }
    }
    Object.defineProperty(window, 'MathMLElement', { configurable: true, value: undefined });
    try { await api.measureMermaidLabel(svg, '$$x$$', ''); }
    catch (error) { errors.push(String(error)); }
    return { errors, text: placed.textContent, imageCount: placed.querySelectorAll('img').length };
  });
  expect(result.imageCount).toBe(0);
  expect(result.text).toContain('<img');
  expect(result.errors).toHaveLength(4);
  expect(result.errors[3]).toContain('cannot render Mermaid MathML');
});

test('literal SVG text mode preserves break-tag spelling without interpreting authored markup', async ({ page }) => {
  await page.setContent('<!doctype html><svg width="800" height="300"></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg=document.querySelector('svg')!,api=(window as any).LabelTest;
    const source='before<br/>$$x$$ after<br>tail';
    const measured=await api.measureMermaidLabel(svg,source,'',{interpretBreakTags:false});
    const placed=measured.place(svg,10,10);
    return {text:placed.textContent,breaks:placed.querySelectorAll('br').length,math:placed.querySelectorAll('math').length};
  });
  expect(result.text).toContain('before<br/>');
  expect(result.text).toContain('after<br>tail');
  expect(result.breaks).toBe(0);
  expect(result.math).toBe(1);
});

test('optional width wraps prose while preserving explicit breaks and whole formula nodes', async ({ page }) => {
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>.label text{font:16px serif;fill:#123456}</style>' +
    '<svg width="100%" height="500" viewBox="0 0 300 300"><svg class="label" id="context"></svg></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('#context') as SVGSVGElement;
    const source = 'alpha beta gamma $$\\frac{a}{b}$$ delta epsilon zeta<br>tail words $$x+y$$';
    const api = (window as any).LabelTest;
    const plain = await api.measureMermaidLabel(svg, source, '');
    const wrapped = await api.measureMermaidLabel(svg, source, '', {
      maxWidth: 115, fontFamily: 'Georgia', fontSize: '18px', fontWeight: '700',
    });
    const placed = wrapped.place(svg, 8, 9);
    const content = placed.querySelector('div')!;
    const formulas = [...placed.querySelectorAll('[data-vs-mermaid-formula]')].map(node =>
      node.getAttribute('data-vs-mermaid-formula'));
    return {
      plainWidth: plain.width, plainHeight: plain.height,
      width: wrapped.width, height: wrapped.height,
      maxWidth: getComputedStyle(content).maxWidth,
      whiteSpace: getComputedStyle(content).whiteSpace,
      fontFamily: getComputedStyle(content).fontFamily,
      fontSize: getComputedStyle(content).fontSize,
      fontWeight: getComputedStyle(content).fontWeight,
      breaks: placed.querySelectorAll('br').length,
      formulas, mathCount: placed.querySelectorAll('math').length,
      viewport: innerWidth,
    };
  });
  expect([320, 1440]).toContain(result.viewport);
  expect(result.width).toBeLessThan(result.plainWidth);
  expect(result.height).toBeGreaterThan(result.plainHeight);
  expect(result.maxWidth).toBe('115px');
  expect(result.whiteSpace).toBe('pre-wrap');
  expect(result.fontFamily).toContain('Georgia');
  expect(result.fontSize).toBe('18px');
  expect(result.fontWeight).toBe('700');
  expect(result.breaks).toBe(1);
  expect(result.formulas).toEqual(['\\frac{a}{b}', 'x+y']);
  expect(result.mathCount).toBe(2);
});

test('wide overhanging and tall math remains atomic and inside measured ink bounds', async ({ page }) => {
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><svg width="100%" height="600" viewBox="0 0 300 300"><svg id="context"></svg></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('#context') as SVGSVGElement;
    const tex = '\\rlap{\\rule{20em}{1em}}\\rule{0pt}{10em}x';
    const measured = await (window as any).LabelTest.measureMermaidLabel(svg,
      `before $$${tex}$$ after`, '', { maxWidth: 80 });
    const placed = measured.place(svg, 0, 0);
    const frame = placed.getBoundingClientRect();
    const visible = [...placed.querySelectorAll('*')].map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 || rect.height > 0);
    return {
      width: measured.width, height: measured.height,
      formulaCount: placed.querySelectorAll('[data-vs-mermaid-formula]').length,
      formula: placed.querySelector('[data-vs-mermaid-formula]')?.getAttribute('data-vs-mermaid-formula'),
      escaped: visible.some(rect => rect.left < frame.left - 1 || rect.top < frame.top - 1 ||
        rect.right > frame.right + 1 || rect.bottom > frame.bottom + 1),
      viewport: innerWidth,
    };
  });
  expect([320, 1440]).toContain(result.viewport);
  expect(result.width).toBeGreaterThan(80);
  expect(result.height).toBeGreaterThan(100);
  expect(result.formulaCount).toBe(1);
  expect(result.formula).toBe('\\rlap{\\rule{20em}{1em}}\\rule{0pt}{10em}x');
  expect(result.escaped).toBe(false);
});

test('wrapping width rejects nonpositive or nonfinite values', async ({ page }) => {
  await page.setContent('<!doctype html><svg width="300" height="100"></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('svg')!;
    const api = (window as any).LabelTest;
    const errors: string[] = [];
    for (const maxWidth of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      try { await api.measureMermaidLabel(svg, 'plain', '', { maxWidth }); }
      catch (error) { errors.push(String(error)); }
    }
    return errors;
  });
  expect(result).toHaveLength(4);
  expect(result.every(error => error.includes('positive and finite'))).toBe(true);
});

test('overhanging formula ink does not intersect adjacent prose with or without wrapping', async ({ page }) => {
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<svg width="100%" height="900" viewBox="0 0 300 500"><svg id="context"></svg></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('#context') as SVGSVGElement;
    const api = (window as any).LabelTest;
    const source = 'before $$\\rlap{\\rule{20em}{1em}}x$$ after';
    const overlap = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const inspect = async (options?: { maxWidth: number }) => {
      const measured = await api.measureMermaidLabel(svg, source, '', options);
      const placed = measured.place(svg, 0, options ? 180 : 0);
      const formula = placed.querySelector('[data-vs-mermaid-formula]')!;
      const after = [...placed.querySelector('div')!.childNodes].find(node =>
        node.nodeType === Node.TEXT_NODE && node.textContent?.includes('after'))!;
      const range = document.createRange();
      const start = after.textContent!.indexOf('after');
      range.setStart(after, start); range.setEnd(after, start + 5);
      const prose = range.getBoundingClientRect();
      const ink = [...formula.querySelectorAll('*')].map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      return { width: measured.width, formulaCount: placed.querySelectorAll('[data-vs-mermaid-formula]').length,
        intersects: ink.some(rect => overlap(rect, prose)) };
    };
    return { defaultLabel: await inspect(), wrappedLabel: await inspect({ maxWidth: 100 }) };
  });
  expect(result.defaultLabel.formulaCount).toBe(1);
  expect(result.wrappedLabel.formulaCount).toBe(1);
  expect(result.defaultLabel.width).toBeGreaterThan(100);
  expect(result.wrappedLabel.width).toBeGreaterThan(100);
  expect(result.defaultLabel.intersects).toBe(false);
  expect(result.wrappedLabel.intersects).toBe(false);
});

test('adjacent overhanging formulas reserve separate ink footprints', async ({ page }) => {
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<svg width="100%" height="900" viewBox="0 0 300 500"><svg id="context"></svg></svg>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('#context') as SVGSVGElement;
    const source = '$$\\rlap{\\rule{20em}{1em}}x$$$$\\smash{\\rule{1em}{10em}}y$$';
    const measured = await (window as any).LabelTest.measureMermaidLabel(svg, source, '', { maxWidth: 100 });
    const placed = measured.place(svg, 0, 0);
    const formulas = [...placed.querySelectorAll('[data-vs-mermaid-formula]')];
    const bounds = formulas.map(formula => {
      const ink = [...formula.querySelectorAll('*')].map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      return { left: Math.min(...ink.map(rect => rect.left)), top: Math.min(...ink.map(rect => rect.top)),
        right: Math.max(...ink.map(rect => rect.right)), bottom: Math.max(...ink.map(rect => rect.bottom)) };
    });
    const [first, second] = bounds;
    return { count: formulas.length, attributes: formulas.map(formula => formula.getAttribute('data-vs-mermaid-formula')),
      intersects: Math.min(first!.right, second!.right) - Math.max(first!.left, second!.left) > 1 &&
        Math.min(first!.bottom, second!.bottom) - Math.max(first!.top, second!.top) > 1 };
  });
  expect(result.count).toBe(2);
  expect(result.attributes).toEqual(['\\rlap{\\rule{20em}{1em}}x', '\\smash{\\rule{1em}{10em}}y']);
  expect(result.intersects).toBe(false);
});
