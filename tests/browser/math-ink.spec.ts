import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
// @ts-expect-error jsdom is supplied by the browser-test harness.
import { JSDOM } from 'jsdom';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';

type Fixture = { html: string; rows: Array<{ key: string; tex: string; display: boolean }> };

// These commands intentionally have small logical dimensions but may paint well
// outside their ordinary TeX layout boxes.  They exercise the runtime's ink
// reservation rather than merely comparing compiler-declared dimensions.
const formulas = [
  String.raw`\rlap{xxxxxxxxxx}x`,
  String.raw`\llap{xxxxxxxxxx}x`,
  String.raw`\smash{\begin{matrix}a\\b\\c\\d\end{matrix}}y`,
  String.raw`\kern-2em x`,
  String.raw`x\!y`,
] as const;

const math = (tex: string) => `$${tex}$`;
let fixture: Fixture;
let runtime: string;
let worker: string;

function source(): string {
  const [rlap, llap, smash, kern, normal] = formulas;
  const attr = (value: string) => JSON.stringify(value);
  return `<!-- vs:id ink_heading -->
# Ink reservation

<!-- vs:id ink_prose_1 -->
Prose left ${math(rlap)} prose right.

<!-- vs:id ink_prose_2 -->
Prose left ${math(llap)} prose right.

<!-- vs:id ink_prose_3 -->
Prose left ${math(smash)} prose right.

<!-- vs:id ink_prose_4 -->
Prose left ${math(kern)} prose right.

<!-- vs:id ink_prose_5 -->
Prose left ${math(normal)} prose right.

{% graph id="ink_graph" mode="architecture" title="Ink graph" question="Does label ink fit?" %}
{% node id="left" role="process" label=${attr(`Graph left ${math(rlap)} graph right`)} /%}
{% node id="right" role="storage" label=${attr(`Graph left ${math(llap)} graph right`)} /%}
{% edge id="graph_edge" from="left" to="right" kind="data" label=${attr(`Graph left ${math(smash)} graph right`)} /%}
{% /graph %}

{% trace id="ink_trace" title="Ink trace" question="Does trace ink fit?" scale="ordinal" %}
{% actor id="actor" label=${attr(`Trace left ${math(kern)} trace right`)} /%}
{% event id="event" actor="actor" label=${attr(`Trace left ${math(normal)} trace right`)} kind="compute" /%}
{% /trace %}

{% measure id="ink_measure" title="Ink measure" question="Does measure ink fit?" unit="unit" %}
{% reading id="reading" label=${attr(`Measure left ${math(rlap)} measure right`)} value=7 valueStatus="measured" display=${attr(`Measure left ${math(normal)} measure right`)} /%}
{% /measure %}`;
}

test.beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), 'visser-math-ink-'));
  try {
    const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
    const path = join(directory, 'index.md');
    writeFileSync(path, `---${frontmatter}---\n\n${source()}`);
    const bundle = loadBundle(path);
    expect(bundle.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
    const compiled = await compileDocument(bundle, {
      version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) },
    }, { audience: 'private', includeSource: false, layoutFallback: false });
    const document = new JSDOM(new TextDecoder().decode(compiled.files.find(file => file.path.endsWith('/index.html'))!.bytes)).window.document;
    const rows = JSON.parse(document.querySelector('meta[name="vs-math-expressions"]')!.getAttribute('content')!) as Fixture['rows'];
    document.querySelectorAll('script, link, meta[http-equiv]').forEach((node: Element) => node.remove());
    document.querySelectorAll('details').forEach((node: Element) => node.setAttribute('open', ''));
    const style = document.createElement('style');
    style.textContent = readFileSync('packages/runtime/src/reader.css', 'utf8');
    document.head.append(style);
    fixture = { html: document.documentElement.outerHTML, rows };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const built = await Promise.all([
    build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'VSInk', write: false }),
    build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser', format: 'iife', write: false }),
  ]);
  runtime = built[0]!.outputFiles[0]!.text;
  worker = built[1]!.outputFiles[0]!.text;
});

test('reserves actual descendant math ink in prose and native graph, trace, and measure labels @M03 @M04 @M10', async ({ page }) => {
  await page.setContent(fixture.html);
  await page.addScriptTag({ content: runtime });
  const status = await page.evaluate(async ({ source, expressions }) =>
    (window as any).VSInk.initializeMath(document, source, expressions), { source: worker, expressions: fixture.rows });
  expect(status.failed).toBe(0);

  // The source records are the authoritative identity, including backslashes.
  expect(fixture.rows).toHaveLength(formulas.length);
  expect(fixture.rows.map(row => row.tex)).toEqual([...formulas]);
  const prose = page.locator('[id^="x-ink_prose_"]');
  await expect(prose.locator('.vs-math')).toHaveCount(formulas.length);
  await expect(prose.locator('.vs-math[data-vs-math-rendered] .vs-math-visual > svg')).toHaveCount(formulas.length);
  for (const tex of formulas) await expect(prose.locator('.vs-math-source').filter({ hasText: math(tex) })).toHaveText(math(tex));

  const nativeByFigure: Readonly<Record<string, readonly string[]>> = {
    ink_graph: [formulas[0], formulas[1], formulas[2]],
    ink_trace: [formulas[3], formulas[4]],
    ink_measure: [formulas[0], formulas[4]],
  };
  for (const [id, expected] of Object.entries(nativeByFigure)) {
    await expect(page.locator(`#x-${id}`)).toHaveAttribute('data-vs-math-ready', '');
    const slots = page.locator(`#x-${id} [data-vs-math-native][data-vs-math-rendered]`);
    for (const tex of expected) {
      const key = JSON.stringify([false, tex]);
      const rendered = await slots.evaluateAll((nodes, wanted) => nodes.filter(node =>
        node.getAttribute('data-vs-math-key') === wanted && (node as SVGSVGElement).getClientRects().length > 0 &&
        Boolean(node.querySelector(':scope > svg'))).length, key);
      expect(rendered, `${id}: ${tex}`).toBeGreaterThan(0);
    }
  }

  const result = await page.evaluate(({ expected }) => {
    type Box = { left: number; top: number; right: number; bottom: number };
    // SVG viewBoxes use font-relative units and retain floating-point transform
    // noise. DOM range/slot geometry is CSS pixels, where only rounding noise
    // is tolerated; a wide tolerance would hide an actual label collision.
    const svgEpsilon = 0.02;
    const cssEpsilon = 0.01;
    const overlap = (a: Box, b: Box) => a.left < b.right - cssEpsilon && b.left < a.right - cssEpsilon && a.top < b.bottom - cssEpsilon && b.top < a.bottom - cssEpsilon;
    const box = (rect: DOMRect): Box => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    const issues: string[] = [];
    const roots = [
      ...document.querySelectorAll<SVGSVGElement>('.vs-math[data-vs-math-rendered] .vs-math-visual > svg'),
      ...[...document.querySelectorAll<SVGSVGElement>('[data-vs-math-native][data-vs-math-rendered] > svg')]
        .filter(root => root.parentElement?.getClientRects().length),
    ];
    let leaves = 0;
    for (const root of roots) {
      const matrix = root.getScreenCTM();
      const viewBox = root.viewBox.baseVal;
      if (!matrix || !viewBox.width || !viewBox.height) {
        issues.push('formula root lacks a usable screen matrix or viewport');
        continue;
      }
      const inverse = matrix.inverse();
      for (const leaf of root.querySelectorAll<SVGGraphicsElement>('path, rect')) {
        const local = leaf.getBBox();
        // Empty paths are the pinned font's deliberate no-ink space glyph.
        if (local.width === 0 && local.height === 0) continue;
        const leafMatrix = leaf.getScreenCTM();
        if (!leafMatrix) {
          issues.push('ink leaf lacks a screen matrix');
          continue;
        }
        leaves++;
        const screenCorners = [
          [local.x, local.y], [local.x + local.width, local.y],
          [local.x, local.y + local.height], [local.x + local.width, local.y + local.height],
        ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(leafMatrix));
        const corners = screenCorners.map(point => point.matrixTransform(inverse));
        const left = Math.min(...corners.map(point => point.x));
        const right = Math.max(...corners.map(point => point.x));
        const top = Math.min(...corners.map(point => point.y));
        const bottom = Math.max(...corners.map(point => point.y));
        if (left < viewBox.x - svgEpsilon || right > viewBox.x + viewBox.width + svgEpsilon ||
            top < viewBox.y - svgEpsilon || bottom > viewBox.y + viewBox.height + svgEpsilon) {
          issues.push(`leaf ink escapes formula viewport: ${left},${top},${right},${bottom} vs ${viewBox.x},${viewBox.y},${viewBox.width},${viewBox.height}`);
        }
        // Native formulas are nested inside the compiler's reserved SVG slot.
        // Independently map the same real leaf through that slot; this catches
        // a correct inner formula viewport that is nevertheless clipped or
        // translated outside the geometry reserved for the label.
        const slot = root.parentElement;
        if (slot instanceof SVGSVGElement && slot.hasAttribute('data-vs-math-native')) {
          const slotMatrix = slot.getScreenCTM();
          const slotViewBox = slot.viewBox.baseVal;
          if (!slotMatrix || !slotViewBox.width || !slotViewBox.height) {
            issues.push('native reservation slot lacks a usable viewport');
          } else {
            const slotCorners = screenCorners.map(point => point.matrixTransform(slotMatrix.inverse()));
            const slotLeft = Math.min(...slotCorners.map(point => point.x));
            const slotRight = Math.max(...slotCorners.map(point => point.x));
            const slotTop = Math.min(...slotCorners.map(point => point.y));
            const slotBottom = Math.max(...slotCorners.map(point => point.y));
            if (slotLeft < slotViewBox.x - svgEpsilon || slotRight > slotViewBox.x + slotViewBox.width + svgEpsilon ||
                slotTop < slotViewBox.y - svgEpsilon || slotBottom > slotViewBox.y + slotViewBox.height + svgEpsilon) {
              issues.push('leaf ink escapes its native reserved slot');
            }
          }
        }
      }
    }

    // Every prose formula has authored text on both sides. A range gives a real
    // browser text box, rather than reusing the formula's declared dimensions.
    let prosePairs = 0;
    for (const formula of document.querySelectorAll<HTMLElement>('[id^="x-ink_prose_"] .vs-math[data-vs-math-rendered]')) {
      const visual = formula.querySelector<SVGSVGElement>('.vs-math-visual > svg');
      const before = formula.previousSibling;
      const after = formula.nextSibling;
      if (!visual || before?.nodeType !== Node.TEXT_NODE || after?.nodeType !== Node.TEXT_NODE) {
        issues.push('prose formula lost an adjacent authored text node');
        continue;
      }
      const rangeBoxes = (node: Node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].map(box);
      };
      const formulaBox = box(visual.getBoundingClientRect());
      for (const adjacent of [...rangeBoxes(before), ...rangeBoxes(after)]) {
        if (adjacent.right > adjacent.left && adjacent.bottom > adjacent.top && overlap(formulaBox, adjacent)) {
          issues.push('prose formula ink overlaps adjacent authored text');
        }
      }
      prosePairs++;
    }

    // Native labels use their SVG slot as the reserved geometry. Check its real
    // screen box against adjacent native text in the same rendered rich line.
    let nativePairs = 0;
    for (const slot of [...document.querySelectorAll<SVGSVGElement>('[data-vs-math-native][data-vs-math-rendered]')]
      .filter(slot => slot.getClientRects().length)) {
      const line = slot.closest<SVGGElement>('.vs-rich-line');
      if (!line) continue;
      const slotBox = box(slot.getBoundingClientRect());
      for (const adjacent of line.querySelectorAll<SVGGraphicsElement>('text')) {
        const adjacentBox = box(adjacent.getBoundingClientRect());
        if (adjacentBox.right > adjacentBox.left && adjacentBox.bottom > adjacentBox.top && overlap(slotBox, adjacentBox)) {
          issues.push('native formula reservation overlaps adjacent label text');
        }
      }
      nativePairs++;
    }

    // These are the renderer-owned boxes, deliberately excluding selection and
    // focus interaction rectangles. Formula-local containment above alone would
    // not catch a failure to grow the enclosing layout owner.
    const visibleSlots = (scope: Element) => [...scope.querySelectorAll<SVGSVGElement>('[data-vs-math-native][data-vs-math-rendered]')]
      .filter(slot => slot.getClientRects().length);
    const contains = (outer: Box, inner: Box) => inner.left >= outer.left - cssEpsilon && inner.right <= outer.right + cssEpsilon &&
      inner.top >= outer.top - cssEpsilon && inner.bottom <= outer.bottom + cssEpsilon;
    const containsLabel = (owner: Box, scope: Element, selector: string, name: string) => {
      const label = scope.querySelector<SVGGraphicsElement>(selector);
      if (!label || !contains(owner, box(label.getBoundingClientRect()))) issues.push(`${name} complete label escapes its owner`);
    };
    let graphOwnerSlots = 0;
    let traceLaneSlots = 0;
    let traceEventSlots = 0;
    let measureSlots = 0;
    let edgeLabelSlots = 0;
    const graph = document.querySelector('#x-ink_graph')!;
    const graphShapes: Box[] = [];
    for (const node of graph.querySelectorAll<SVGAElement>('.vs-node')) {
      const shape = node.querySelector<SVGGraphicsElement>(':scope > .vs-shape');
      const slots = visibleSlots(node);
      if (slots.length === 0) continue;
      if (!shape) { issues.push('graph label owner has no direct outline shape'); continue; }
      const ownerBox = box(shape.getBoundingClientRect());
      graphShapes.push(ownerBox);
      containsLabel(ownerBox, node, '.vs-node-label', 'graph node');
      for (const slot of slots) {
        graphOwnerSlots++;
        if (!contains(ownerBox, box(slot.getBoundingClientRect()))) issues.push('graph formula escapes its node outline');
      }
    }
    const edge = graph.querySelector<SVGAElement>('.vs-edge[data-vs-target="graph_edge"]');
    const edgeBackground = edge?.querySelector<SVGGraphicsElement>(':scope > .vs-edge-label-bg');
    const edgeSlots = edge ? visibleSlots(edge) : [];
    if (!edgeBackground || edgeSlots.length === 0) issues.push('graph edge lacks its visible label background or formula');
    else {
      const labelBox = box(edgeBackground.getBoundingClientRect());
      containsLabel(labelBox, edge!, '.vs-edge-label', 'graph edge');
      for (const slot of edgeSlots) {
        edgeLabelSlots++;
        if (!contains(labelBox, box(slot.getBoundingClientRect()))) issues.push('edge formula escapes its label background');
      }
      if (graphShapes.some(shape => overlap(labelBox, shape))) issues.push('edge label background overlaps an endpoint node outline');
    }

    const trace = document.querySelector('#x-ink_trace')!;
    for (const lane of trace.querySelectorAll<SVGAElement>('.vs-lane')) {
      const slots = visibleSlots(lane);
      if (slots.length === 0) continue;
      const header = lane.querySelector<SVGRectElement>(':scope > rect:not(.vs-selection-outline):not(.vs-focus-outline)');
      if (!header) { issues.push('trace actor lacks a direct header rect'); continue; }
      const ownerBox = box(header.getBoundingClientRect());
      containsLabel(ownerBox, lane, '.vs-lane-label', 'trace actor');
      for (const slot of slots) {
        traceLaneSlots++;
        if (!contains(ownerBox, box(slot.getBoundingClientRect()))) issues.push('trace actor formula escapes its header rect');
      }
    }
    for (const event of trace.querySelectorAll<SVGAElement>('.vs-event-box')) {
      const slots = visibleSlots(event);
      if (slots.length === 0) continue;
      const shape = event.querySelector<SVGGraphicsElement>(':scope > .vs-shape');
      if (!shape) { issues.push('trace event lacks a direct outline shape'); continue; }
      const ownerBox = box(shape.getBoundingClientRect());
      containsLabel(ownerBox, event, '.vs-trace-label', 'trace event');
      for (const slot of slots) {
        traceEventSlots++;
        if (!contains(ownerBox, box(slot.getBoundingClientRect()))) issues.push('trace event formula escapes its outline');
      }
    }

    // Measure labels and values deliberately have no per-label panel. Their
    // enclosing contract is the complete measure viewport and its bar lane.
    const measure = document.querySelector<SVGSVGElement>('#x-ink_measure .vs-measure-svg');
    const bar = measure?.querySelector<SVGGraphicsElement>('.vs-bar');
    if (!measure || !bar) issues.push('measure lacks its viewport or bar');
    else {
      const viewport = box(measure.getBoundingClientRect());
      const barBox = box(bar.getBoundingClientRect());
      for (const label of measure.querySelectorAll<SVGGraphicsElement>('.vs-rich-measure-text')) {
        const labelBox = box(label.getBoundingClientRect());
        if (!contains(viewport, labelBox)) issues.push('complete measure label escapes viewport');
        if (overlap(labelBox, barBox)) issues.push('complete measure label overlaps bar');
      }
      for (const slot of visibleSlots(measure)) {
        measureSlots++;
        const slotBox = box(slot.getBoundingClientRect());
        if (!contains(viewport, slotBox)) issues.push('measure formula escapes the SVG viewport');
        if (overlap(slotBox, barBox)) issues.push('measure formula overlaps the value bar');
      }
    }

    const nativeKeys = new Set([...document.querySelectorAll<SVGSVGElement>('[data-vs-math-native][data-vs-math-rendered]')]
      .filter(slot => slot.getClientRects().length)
      .map(slot => slot.getAttribute('data-vs-math-key')));
    const missing = expected.filter(tex => !nativeKeys.has(JSON.stringify([false, tex])));
    return { issues, roots: roots.length, leaves, prosePairs, nativePairs, graphOwnerSlots, edgeLabelSlots, traceLaneSlots, traceEventSlots, measureSlots, missing };
  }, { expected: [...formulas] });

  expect(result.roots).toBeGreaterThanOrEqual(formulas.length * 2);
  expect(result.leaves).toBeGreaterThan(0);
  expect(result.prosePairs).toBe(formulas.length);
  expect(result.nativePairs).toBeGreaterThanOrEqual(formulas.length);
  expect(result.graphOwnerSlots).toBeGreaterThanOrEqual(2);
  expect(result.edgeLabelSlots).toBeGreaterThan(0);
  expect(result.traceLaneSlots).toBeGreaterThan(0);
  expect(result.traceEventSlots).toBeGreaterThan(0);
  expect(result.measureSlots).toBeGreaterThanOrEqual(2);
  expect(result.missing).toEqual([]);
  expect(result.issues).toEqual([]);
});
