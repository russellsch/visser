// Source transformations used by Mermaid 12's flowchart parser. Keep each
// deletion/replacement attached to original UTF-16 coordinates; grammar
// collectors consume parserInput, never search rendered labels in the fence.
import { ProvenanceText } from './source-provenance.ts';
import { MathPolicyError } from '../math/policy.ts';
import { MERMAID_SOURCE_LIMIT, checkMermaidSource } from './rules.ts';

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `flowchart source mapping: ${message}`);
}

/** Normalize line endings/BOM and only the fence indentation removed by Visser. */
export function mapMermaidFence(original: string, rendered: string): ProvenanceText {
  if (new TextEncoder().encode(original).length > MERMAID_SOURCE_LIMIT) invalid('source exceeds figure limit');
  let mapped = ProvenanceText.identity(original);
  if (mapped.text.startsWith('\uFEFF')) mapped = mapped.slice(1, mapped.length);
  mapped = mapped.replaceRegex(/\r\n?/g, () => '\n');
  const rawLines = mapped.text.split('\n');
  const shownLines = rendered.split('\n');
  if (rawLines.length !== shownLines.length) invalid('line count differs from normalized fence');
  const pieces: ProvenanceText[] = [];
  let at = 0;
  for (let index = 0; index < rawLines.length; index++) {
    const raw = rawLines[index]!;
    const shown = shownLines[index]!;
    const removed = raw.length - shown.length;
    if (removed < 0 || !raw.endsWith(shown) || !/^[ \t]*$/.test(raw.slice(0, removed))) {
      invalid('displayed fence differs beyond leading indentation');
    }
    pieces.push(mapped.slice(at + removed, at + raw.length));
    at += raw.length;
    if (index < rawLines.length - 1) { pieces.push(mapped.slice(at, at + 1)); at++; }
  }
  return mapped.slice(0, 0).concatAll(pieces);
}

/**
 * Restricted-source counterpart of preprocessDiagram -> encodeEntities ->
 * flowParser.parse. Existing unsafe-source rules still apply. E_MATH here is
 * the temporary family guard, not a preprocessing rejection; collectors will
 * validate extracted labels before that guard can be removed.
 */
export function mapFlowchartParserInput(original: string, rendered: string): {
  mermaidInput: ProvenanceText; parserInput: ProvenanceText;
} {
  let mapped = mapMermaidFence(original, rendered);
  const issue = checkMermaidSource(rendered).find(issue => issue.code !== 'E_MATH');
  if (issue) invalid(issue.message);
  // cleanupText also rewrites quoted HTML attributes. Visser admits only <br>
  // without attributes, so that transform is an identity in this contract.
  mapped = mapped.replaceRegex(/^\s*%%(?!{)[^\n]+\n?/gm, () => '');
  const leading = mapped.text.length - mapped.text.trimStart().length;
  mapped = mapped.slice(leading, mapped.length);
  // encodeEntities first removes style/classDef semicolons before encoding.
  // Preserve the exact retained prefix rather than mapping it to the deletion.
  for (const pattern of [/style.*:\S*#.*;/g, /classDef.*:\S*#.*;/g]) {
    mapped = mapped.replaceRegex(pattern, (_match, span) => span.slice(0, span.length - 1));
  }
  // Source rules reject the complete entity grammar, including mixed/underscore
  // names. Retain the exact pinned transform to detect any future rule drift.
  mapped = mapped.replaceRegex(/#\w+;/g, (match) => {
    const inner = match[0].slice(1, -1);
    return /^\+?\d+$/.test(inner) ? `\uFB02\u00B0\u00B0${inner}\u00B6\u00DF` : `\uFB02\u00B0${inner}\u00B6\u00DF`;
  });
  const mermaidInput = mapped.concat(mapped.synthetic('\n'));
  const parserInput = mermaidInput.replaceRegex(/}\s*\n/g, (_match, span) =>
    span.slice(0, 1).concat(span.slice(span.length - 1, span.length)));
  return { mermaidInput, parserInput };
}
