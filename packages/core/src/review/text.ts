// Text helpers for the editorial review prompts (§16.3, §15.6). Review reads
// prose only: inline code, fences, and citation markers are not prose.
import type { MNode } from '../model/targets.ts';

/**
 * The prose of `node` without its child targets, inline code, fences, or
 * citation markers. With `code`, each inline code span becomes that one word,
 * so that a word count still counts it (the reader reads it).
 */
export function proseOf(node: MNode, isTarget: (n: MNode) => boolean, code = ' '): string {
  const parts: string[] = [];
  const visit = (n: MNode) => {
    if (n !== node && isTarget(n)) return;
    switch (n.type) {
      case 'text':
        parts.push(String(n.attributes['content'] ?? ''));
        return;
      case 'code':
        parts.push(code === ' ' ? ' ' : ` ${code} `);
        return;
      case 'fence':
        parts.push(' ');
        return;
      case 'softbreak':
      case 'hardbreak':
        parts.push(' ');
        return;
      case 'tag':
        if (n.tag === 'cite') return;
        break;
    }
    const block = ['paragraph', 'heading', 'item', 'blockquote', 'tr', 'td', 'th'].includes(n.type);
    for (const child of n.children) visit(child);
    if (block) parts.push('\n');
  };
  visit(node);
  return parts.join('').replace(/[ \t]+/g, ' ').trim();
}

/** True if `node` (without its child targets) contains a `cite` tag. */
export function hasCite(node: MNode, isTarget: (n: MNode) => boolean): boolean {
  let found = false;
  const visit = (n: MNode) => {
    if (found || (n !== node && isTarget(n))) return;
    if (n.type === 'tag' && n.tag === 'cite') {
      found = true;
      return;
    }
    for (const child of n.children) visit(child);
  };
  visit(node);
  return found;
}

/** Sentences of a prose string (a simple split on terminal punctuation). */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s !== '');
}

/** String attributes that are visible text (titles, labels, questions, summaries). */
export function visibleAttributes(node: MNode): string[] {
  return ['title', 'label', 'question', 'summary', 'term']
    .map((key) => node.attributes[key])
    .filter((v): v is string => typeof v === 'string');
}

/** The words of a text: whitespace-separated tokens that contain a letter or a digit. */
export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/** Text with quoted material ("...", “...”) removed: the prose rules do not apply to a quotation. */
export function withoutQuotes(text: string): string {
  return text.replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');
}

/** A number with a thousands separator, the same on every machine. */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
