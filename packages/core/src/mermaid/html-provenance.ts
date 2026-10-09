// Environment-neutral source tracing. The caller supplies actual sanitizer
// output; unsupported HTML structure receives synthetic provenance.
import { EntityDecoder, DecodingMode, htmlDecodeTree } from 'entities/decode';
import { ProvenanceText } from './source-provenance.ts';

/** Decode each reference with its exact consumed interval, including legacy prefixes. */
export function decodeHtmlReferences(input: ProvenanceText, mode = DecodingMode.Legacy): ProvenanceText {
  const chunks: ProvenanceText[] = [];
  let cursor = 0;
  let search = 0;
  let decoded = '';
  const decoder = new EntityDecoder(htmlDecodeTree, cp => { decoded += String.fromCodePoint(cp); });
  while (true) {
    const start = input.text.indexOf('&', search);
    if (start < 0) break;
    decoded = '';
    decoder.startEntity(mode);
    let consumed = decoder.write(input.text, start + 1);
    if (consumed < 0) consumed = decoder.end();
    if (consumed > 0 && decoded) {
      chunks.push(input.slice(cursor, start));
      const reference = input.slice(start, start + consumed);
      chunks.push(reference.replace(0, reference.length, decoded));
      cursor = start + consumed;
      search = cursor;
    } else search = start + 1;
  }
  chunks.push(input.slice(cursor, input.length));
  return input.slice(0, 0).concatAll(chunks);
}

function textSerialization(input: ProvenanceText): ProvenanceText {
  // HTML input preprocessing precedes character-reference decoding. An entity
  // producing a CR therefore does not become a newline in this pass.
  const normalized = input.replaceRegex(/\r\n?/g, () => '\n').replaceRegex(/\0/g, () => '');
  return decodeHtmlReferences(normalized).replaceRegex(/[&<>\u00a0]/g, match =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\u00a0': '&nbsp;' })[match[0]]!);
}

/** Trace text and breaks; real sanitizer output attests every pass. */
export function traceMermaidHtmlPass(input: ProvenanceText, actual: string): ProvenanceText {
  if (!input.text.includes('<')) return input.text === actual ? input : input.synthetic(actual);
  const chunks: ProvenanceText[] = [];
  // DOMPurify reinserts this exact prefix after DOMParser discarded it,
  // preserving CRLF here even though later HTML text normalizes CR to LF.
  let cursor = /^[\r\n\t ]+/.exec(input.text)?.[0].length ?? 0;
  if (cursor) chunks.push(input.slice(0, cursor));
  for (const match of input.text.matchAll(/<br\s*\/?>/gi)) {
    const preceding = input.slice(cursor, match.index);
    if (/<[!/?A-Za-z]/.test(preceding.text)) return input.synthetic(actual);
    chunks.push(textSerialization(preceding));
    const end = match.index + match[0].length;
    const tag = input.slice(match.index, end);
    chunks.push(tag.replace(0, tag.length, '<br>'));
    cursor = end;
  }
  const trailing = input.slice(cursor, input.length);
  if (/<[!/?A-Za-z]/.test(trailing.text)) return input.synthetic(actual);
  chunks.push(textSerialization(trailing));
  const traced = input.slice(0, 0).concatAll(chunks);
  // Complex native tree repair/deletion is still accepted and validated, but
  // gets no invented source span. Never recover identity by matching text.
  return traced.text === actual ? traced : input.synthetic(actual);
}

