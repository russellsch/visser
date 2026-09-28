// A line diff for the before-and-after view of an `annotated` figure
// (docs/IMPROVEMENTS.md §14.7). The build computes it, so the page and the
// Markdown projection show the same rows on every machine. The method is the
// longest common subsequence of whole lines; ties keep the removed line
// before the added line, so the result is deterministic.

export type DiffRow =
  | { op: 'same'; before: number; after: number }
  | { op: 'removed'; before: number }
  | { op: 'added'; after: number };

/**
 * The most lines on one side of a diff. The validator reports `E_LIMIT`
 * above it, so the table below never holds more than (2,001 × 2,001) cells
 * of 4 bytes: about 16 MB (phase 6a review C1).
 */
export const DIFF_MAX_LINES = 2000;

/** Lines of a captured excerpt: line ends normalized, one final newline dropped. */
export function excerptLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
}

/**
 * The rows of a line diff from `before` to `after`, in reading order. Each
 * row holds 0-based line indexes. The common prefix and the common suffix
 * are equal rows and never enter the table, so the table covers only the
 * lines between them. The table is one flat Uint32Array, not an array of
 * arrays of numbers, so its memory is 4 bytes a cell. A side above
 * DIFF_MAX_LINES is an error: the validator stops such a document first.
 */
export function lineDiff(before: readonly string[], after: readonly string[]): DiffRow[] {
  if (before.length > DIFF_MAX_LINES || after.length > DIFF_MAX_LINES) {
    throw new RangeError(`a diff side has more than ${DIFF_MAX_LINES} lines`);
  }
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const n = before.length - head - tail;
  const m = after.length - head - tail;
  const rows: DiffRow[] = [];
  for (let k = 0; k < head; k++) rows.push({ op: 'same', before: k, after: k });
  // lcs[i * w + j]: the length of the longest common subsequence of the
  // middle parts before[head + i ..] and after[head + j ..].
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    const a = before[head + i];
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a === after[head + j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[head + i] === after[head + j]) {
      rows.push({ op: 'same', before: head + i++, after: head + j++ });
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      rows.push({ op: 'removed', before: head + i++ });
    } else {
      rows.push({ op: 'added', after: head + j++ });
    }
  }
  while (i < n) rows.push({ op: 'removed', before: head + i++ });
  while (j < m) rows.push({ op: 'added', after: head + j++ });
  for (let k = 0; k < tail; k++) rows.push({ op: 'same', before: before.length - tail + k, after: after.length - tail + k });
  return rows;
}

/** One row of the side-by-side view: a line on each side, or a gap where the other side has a line. */
export type DiffPair = { before?: number; after?: number; changed: boolean };

/**
 * The side-by-side rows: equal lines pair up; in each changed run, the i-th
 * removed line pairs with the i-th added line, and the shorter side gets
 * gaps. The stacked view on a narrow screen drops the gaps.
 */
export function diffPairs(rows: readonly DiffRow[]): DiffPair[] {
  const out: DiffPair[] = [];
  let k = 0;
  while (k < rows.length) {
    const row = rows[k]!;
    if (row.op === 'same') {
      out.push({ before: row.before, after: row.after, changed: false });
      k++;
      continue;
    }
    const removed: number[] = [];
    const added: number[] = [];
    while (k < rows.length && rows[k]!.op !== 'same') {
      const r = rows[k]!;
      if (r.op === 'removed') removed.push(r.before);
      else if (r.op === 'added') added.push(r.after);
      k++;
    }
    for (let x = 0; x < Math.max(removed.length, added.length); x++) {
      const pair: DiffPair = { changed: true };
      if (x < removed.length) pair.before = removed[x]!;
      if (x < added.length) pair.after = added[x]!;
      out.push(pair);
    }
  }
  return out;
}
