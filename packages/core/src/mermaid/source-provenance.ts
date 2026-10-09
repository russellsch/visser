// Immutable UTF-16 provenance for bounded Mermaid preprocessing. A copied
// output unit points to its exact original unit; a replacement points to the
// entire source interval it replaced. Generated text is explicitly synthetic.

export type SourceInterval = Readonly<{ start: number; end: number }>;
export type UnitOrigin = Readonly<{
  kind: 'copy' | 'replacement' | 'synthetic';
  intervals: readonly SourceInterval[];
  synthetic: boolean;
}>;
export type RangeOrigin = Readonly<{ intervals: readonly SourceInterval[]; synthetic: boolean }>;
export type ProvenanceReplacement = string | ProvenanceText | Readonly<{ text: string; kind: 'synthetic' }>;

type Root = Readonly<{ source: string }>;

const SYNTHETIC: UnitOrigin = Object.freeze({ kind: 'synthetic', intervals: Object.freeze([]), synthetic: true });

function boundedRange(start: number, end: number, length: number): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > length) {
    throw new RangeError(`invalid UTF-16 range [${start}, ${end}) for length ${length}`);
  }
}

function mappedRange(origins: readonly UnitOrigin[], start: number, end: number): RangeOrigin {
  const intervals: SourceInterval[] = [];
  let synthetic = false;
  let previous: UnitOrigin | undefined;
  for (let i = start; i < end; i++) {
    const origin = origins[i]!;
    synthetic ||= origin.synthetic;
    // Every output unit of a replacement shares one immutable origin. Visit
    // that origin once per run, rather than expanding N copies of M islands.
    if (origin === previous) continue;
    previous = origin;
    for (const interval of origin.intervals) {
      const last = intervals.at(-1);
      if (last && interval.start >= last.start && interval.start <= last.end) {
        intervals[intervals.length - 1] = { start: last.start, end: Math.max(last.end, interval.end) };
      } else intervals.push({ start: interval.start, end: interval.end });
    }
  }
  return { intervals: Object.freeze(intervals.map(interval => Object.freeze(interval))), synthetic };
}

/** Immutable text and the original-source origin of each output UTF-16 unit. */
export class ProvenanceText {
  readonly text: string;
  readonly #root: Root;
  readonly #origins: readonly UnitOrigin[];

  private constructor(text: string, root: Root, origins: readonly UnitOrigin[]) {
    if (text.length !== origins.length) throw new RangeError('origin count must match UTF-16 text length');
    this.text = text;
    this.#root = root;
    this.#origins = Object.freeze([...origins]);
    Object.freeze(this);
  }

  static identity(source: string): ProvenanceText {
    const root: Root = Object.freeze({ source });
    const origins: UnitOrigin[] = Array.from({ length: source.length }, (_, index) =>
      Object.freeze({ kind: 'copy' as const,
        intervals: Object.freeze([Object.freeze({ start: index, end: index + 1 })]), synthetic: false }));
    return new ProvenanceText(source, root, origins);
  }

  get length(): number { return this.text.length; }
  get source(): string { return this.#root.source; }

  originAt(index: number): UnitOrigin {
    boundedRange(index, index + 1, this.length);
    return this.#origins[index]!;
  }

  mapRange(start: number, end: number): RangeOrigin {
    boundedRange(start, end, this.length);
    return mappedRange(this.#origins, start, end);
  }

  slice(start: number, end: number): ProvenanceText {
    boundedRange(start, end, this.length);
    return new ProvenanceText(this.text.slice(start, end), this.#root, this.#origins.slice(start, end));
  }

  /** Synthetic text in the same source coordinate system, for prefix/suffix. */
  synthetic(text: string): ProvenanceText {
    return new ProvenanceText(text, this.#root, Array(text.length).fill(SYNTHETIC));
  }

  concat(...parts: readonly ProvenanceText[]): ProvenanceText {
    return this.concatAll(parts);
  }

  /** Iterate rather than spreading a source-sized list into call arguments. */
  concatAll(parts: Iterable<ProvenanceText>): ProvenanceText {
    let text = this.text;
    const origins = [...this.#origins];
    for (const part of parts) {
      if (part.#root !== this.#root) throw new TypeError('cannot combine different source origins');
      text += part.text;
      for (const origin of part.#origins) origins.push(origin);
    }
    return new ProvenanceText(text, this.#root, origins);
  }

  /**
   * Replace an effective range. A string maps each new unit to the complete
   * removed source span; a ProvenanceText retains its own precise origins.
   * Use `{kind:'synthetic',text}` for generated content or zero-width inserts.
   */
  replace(start: number, end: number, replacement: ProvenanceReplacement): ProvenanceText {
    boundedRange(start, end, this.length);
    const insert = this.#replacement(start, end, replacement);
    return new ProvenanceText(this.text.slice(0, start) + insert.text + this.text.slice(end), this.#root,
      [...this.#origins.slice(0, start), ...insert.#origins, ...this.#origins.slice(end)]);
  }

  /** Every match is replaced against the same immutable input, in match order. */
  replaceRegex(pattern: RegExp,
    replacement: (match: RegExpExecArray, matched: ProvenanceText) => ProvenanceReplacement): ProvenanceText {
    if (!pattern.global) throw new TypeError('mapped regex replacement requires a global pattern');
    const chunks: string[] = [];
    const origins: UnitOrigin[] = [];
    let cursor = 0;
    for (const match of this.text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (start < cursor) throw new RangeError('overlapping regex matches cannot be mapped');
      chunks.push(this.text.slice(cursor, start));
      for (let i = cursor; i < start; i++) origins.push(this.#origins[i]!);
      const insert = this.#replacement(start, end, replacement(match, this.slice(start, end)));
      chunks.push(insert.text);
      for (const origin of insert.#origins) origins.push(origin);
      cursor = end;
    }
    chunks.push(this.text.slice(cursor));
    for (let i = cursor; i < this.length; i++) origins.push(this.#origins[i]!);
    return new ProvenanceText(chunks.join(''), this.#root, origins);
  }

  #replacement(start: number, end: number, value: ProvenanceReplacement): ProvenanceText {
    if (value instanceof ProvenanceText) {
      if (value.#root !== this.#root) throw new TypeError('replacement has a different source origin');
      return value;
    }
    if (typeof value !== 'string') return this.synthetic(value.text);
    if (value === '') return this.synthetic('');
    if (start === end) throw new RangeError('zero-width insertion must be explicitly synthetic');
    const prior = mappedRange(this.#origins, start, end);
    const origin: UnitOrigin = Object.freeze({ kind: 'replacement', intervals: prior.intervals, synthetic: prior.synthetic });
    return new ProvenanceText(value, this.#root, Array(value.length).fill(origin));
  }
}
