// Term auto-link (docs/IMPROVEMENTS.md §13.3). The compiler links each use of
// a defined term to its definition at build time, so the author writes the
// definition once and the reader gets help at every use. The match is
// whole-word and ignores case. The phrases of all definitions go into one
// pattern, longest phrase first, so a longer term wins over a shorter term
// that it contains. The scan goes from the start of the text to the end, so
// the output is the same for the same input (ARCHITECTURE.md §7.5).

/** One definition that the compiler can link: its ID, its term, and its aliases. */
export type LinkableDefinition = { id: string; term: string; aliases?: readonly string[]; auto?: boolean };

/** A run of plain text, or one use of a term with the ID of its definition. */
export type TermSegment = string | { text: string; defId: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The comparison key of a phrase: lower case, with one space between words. */
export function phraseKey(phrase: string): string {
  return phrase.trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * Finds the uses of defined terms in text. A definition with `auto=false`
 * is not linked. When two definitions share a phrase, the first definition in
 * document order owns it.
 */
export class TermMatcher {
  readonly #owner = new Map<string, string>(); // phrase key -> definition ID
  readonly #pattern: RegExp | undefined;

  constructor(definitions: readonly LinkableDefinition[]) {
    for (const def of definitions) {
      if (def.auto === false) continue;
      for (const phrase of [def.term, ...(def.aliases ?? [])]) {
        const key = phraseKey(phrase);
        if (key !== '' && !this.#owner.has(key)) this.#owner.set(key, def.id);
      }
    }
    // Longest phrase first, then in code-point order, so the alternation is stable.
    const keys = [...this.#owner.keys()].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
    if (keys.length > 0) {
      const alternatives = keys.map((k) => k.split(' ').map(escape).join('\\s+')).join('|');
      // A word character, a digit, an underscore, or a hyphen next to the
      // match means that the match is part of a longer word.
      this.#pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${alternatives})(?![\\p{L}\\p{N}_-])`, 'giu');
    }
  }

  /** True when no definition can be linked. */
  get empty(): boolean {
    return this.#pattern === undefined;
  }

  /** The definition that owns a phrase, if any. */
  ownerOf(phrase: string): string | undefined {
    return this.#owner.get(phraseKey(phrase));
  }

  /**
   * Split text into plain runs and term uses. A use of the definition
   * `skip` stays plain text (the term in its own definition).
   */
  split(text: string, skip?: string): TermSegment[] {
    if (!this.#pattern || text === '') return text === '' ? [] : [text];
    const out: TermSegment[] = [];
    let last = 0;
    this.#pattern.lastIndex = 0;
    for (const match of text.matchAll(this.#pattern)) {
      const defId = this.#owner.get(phraseKey(match[0]));
      if (!defId || defId === skip) continue;
      if (match.index > last) out.push(text.slice(last, match.index));
      out.push({ text: match[0], defId });
      last = match.index + match[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
}
