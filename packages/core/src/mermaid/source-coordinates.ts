// Convert grammar-owned UTF-16 provenance to exact original fence byte spans.
// Never encode a prefix ending halfway through a Unicode scalar: TextEncoder
// would silently replace that half with U+FFFD and invent a byte coordinate.
import type { ProvenanceText, SourceInterval } from './source-provenance.ts';

export type LocatedSourceInterval = Readonly<{
  sourceStart: number; sourceEnd: number;
  startByte: number; endByte: number;
  startLine: number; endLine: number;
  rawSource: string;
}>;

export class MermaidSourceCoordinates {
  readonly source: string;
  readonly #bytes: Int32Array;
  readonly #lines: Int32Array;

  constructor(source: string) {
    this.source = source;
    this.#bytes = new Int32Array(source.length + 1).fill(-1);
    this.#lines = new Int32Array(source.length + 1);
    let byte = 0, line = 1;
    for (let index = 0; index < source.length;) {
      this.#bytes[index] = byte;
      this.#lines[index] = line;
      const code = source.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = source.charCodeAt(index + 1);
        if (!(low >= 0xdc00 && low <= 0xdfff)) throw new RangeError('original Mermaid source contains an unpaired surrogate');
        byte += 4; index += 2;
      } else {
        if (code >= 0xdc00 && code <= 0xdfff) throw new RangeError('original Mermaid source contains an unpaired surrogate');
        byte += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
        if (code === 0x0a || (code === 0x0d && source.charCodeAt(index + 1) !== 0x0a)) line++;
        index++;
      }
    }
    this.#bytes[source.length] = byte;
    this.#lines[source.length] = line;
    Object.freeze(this);
  }

  locate({ start, end }: SourceInterval): LocatedSourceInterval {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > this.source.length) {
      throw new RangeError('source interval is outside original Mermaid fence');
    }
    const startByte = this.#bytes[start]!;
    const endByte = this.#bytes[end]!;
    if (startByte < 0 || endByte < 0) throw new RangeError('source interval splits a Unicode scalar');
    return { sourceStart: start, sourceEnd: end, startByte, endByte,
      startLine: this.#lines[start]!, endLine: this.#lines[end]!, rawSource: this.source.slice(start, end) };
  }

  /** Preserve disjoint/reordered origins; do not merge across removed comments. */
  locateRange(mapped: ProvenanceText, start: number, end: number): {
    intervals: LocatedSourceInterval[]; synthetic: boolean;
  } {
    if (mapped.source !== this.source) throw new RangeError('provenance belongs to different original source');
    const origins = mapped.mapRange(start, end);
    return { intervals: origins.intervals.map(interval => this.locate(interval)), synthetic: origins.synthetic };
  }
}
