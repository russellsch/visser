// Pure measured text/math runs for native SVG layout. Conversion and policy
// validation happen upstream; this module consumes only finite metrics.
import type { MathMetrics } from '../math/engine.ts';
import { parseMathTextRuns } from '../syntax/math-runs.ts';

export type RichTextRun = { kind: 'text'; text: string; width: number };
export type RichMathRun = { kind: 'math'; tex: string; key: string; width: number; height: number; ascent: number; descent: number };
export type RichRun = RichTextRun | RichMathRun;
export type RichLine = { runs: RichRun[]; width: number; height: number; ascent: number; descent: number };
export type RichBlock = { lines: RichLine[]; width: number; height: number };

const FONT_PX = 14;
const TEXT_ASCENT = 14;
const TEXT_DESCENT = 4;
const TEXT_HEIGHT = TEXT_ASCENT + TEXT_DESCENT;
const rounded = (n: number) => Math.round(n * 1000) / 1000;
export const mathMetricKey = (tex: string): string => JSON.stringify([false, tex]);

function metricRun(tex: string, metrics: Readonly<Record<string, MathMetrics>>): RichMathRun {
  const key = mathMetricKey(tex);
  const metric = metrics[key];
  if (!metric || ![metric.widthEm, metric.heightEm, metric.depthEm, metric.ascentEm].every(Number.isFinite) ||
    metric.widthEm <= 0 || metric.heightEm <= 0 || metric.ascentEm <= 0 || metric.depthEm < 0 ||
    Math.abs(metric.ascentEm + metric.depthEm - metric.heightEm) > 0.002) {
    throw Object.assign(new Error(`missing or invalid measured math for ${JSON.stringify(tex)}`), { code: 'E_MATH_INVALID' });
  }
  return { kind: 'math', tex, key, width: rounded(metric.widthEm * FONT_PX),
    height: rounded(metric.heightEm * FONT_PX), ascent: rounded(metric.ascentEm * FONT_PX), descent: rounded(metric.depthEm * FONT_PX) };
}

/** A measured label, or undefined when it has no math (legacy layout stays exact). */
export function measureRichText(
  source: string,
  maxWidth: number,
  metrics: Readonly<Record<string, MathMetrics>> | undefined,
  textWidth: (s: string) => number,
): RichBlock | undefined {
  return measureRichSegments([source], maxWidth, metrics, textWidth);
}

/** Segment boundaries are authored-field boundaries, so delimiters never pair across fields. */
export function measureRichSegments(
  segments: readonly string[],
  maxWidth: number,
  metrics: Readonly<Record<string, MathMetrics>> | undefined,
  textWidth: (s: string) => number,
): RichBlock | undefined {
  if (!metrics) return undefined;
  const parsed = segments.flatMap(parseMathTextRuns);
  if (!parsed.some((run) => run.kind === 'math')) return undefined;
  const units: RichRun[] = [];
  for (const run of parsed) {
    if (run.kind === 'math') { units.push(metricRun(run.tex, metrics)); continue; }
    for (const match of run.text.matchAll(/\s+|\S+/g)) {
      const text = /^\s+$/.test(match[0]) ? ' ' : match[0];
      units.push({ kind: 'text', text, width: textWidth(text) });
    }
  }
  const lines: RichLine[] = [];
  let runs: RichRun[] = [];
  let width = 0;
  const flush = () => {
    if (runs.length === 0) return;
    const ascent = Math.max(TEXT_ASCENT, ...runs.filter((r): r is RichMathRun => r.kind === 'math').map((r) => r.ascent));
    const descent = Math.max(TEXT_DESCENT, ...runs.filter((r): r is RichMathRun => r.kind === 'math').map((r) => r.descent));
    lines.push({ runs, width: rounded(width), ascent: rounded(ascent), descent: rounded(descent), height: rounded(Math.max(TEXT_HEIGHT, ascent + descent)) });
    runs = []; width = 0;
  };
  const append = (run: RichRun) => {
    const prev = runs.at(-1);
    if (run.kind === 'text' && prev?.kind === 'text') {
      prev.text += run.text; prev.width = rounded(prev.width + run.width);
    } else runs.push({ ...run });
    width += run.width;
  };
  let space: RichTextRun | undefined;
  for (const unit of units) {
    if (unit.kind === 'text' && unit.text === ' ') { space = unit; continue; }
    const pending = runs.length > 0 ? space?.width ?? 0 : 0;
    if (runs.length > 0 && width + pending + unit.width > maxWidth) flush();
    if (runs.length > 0 && space) append(space);
    append(unit);
    space = undefined;
  }
  flush();
  return { lines, width: rounded(Math.max(...lines.map((l) => l.width))), height: rounded(lines.reduce((n, l) => n + l.height, 0)) };
}

/** Plain fallback lines retain every source delimiter for copying and aria text. */
export function richFallbackLines(block: RichBlock): string[] {
  return block.lines.map((line) => line.runs.map((run) => run.kind === 'text' ? run.text : `$${run.tex}$`).join(''));
}
