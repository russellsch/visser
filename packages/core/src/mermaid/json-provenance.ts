// Decode JSON string tokens while retaining the exact UTF-16 provenance of
// each decoded unit. JSON.parse remains the grammar authority; this scanner
// only finds strings after that authoritative validation succeeds.
import { ProvenanceText } from './source-provenance.ts';

export type JsonStringToken = Readonly<{
  kind: 'key' | 'value';
  /** Number of enclosing object/array containers at the string token. */
  depth: number;
  mappedValue: ProvenanceText;
}>;

export type JsonWithStringProvenance = Readonly<{
  value: unknown;
  tokens: readonly JsonStringToken[];
}>;

function invalid(message: string): never {
  throw new SyntaxError(`JSON provenance: ${message}`);
}

function decodedEscape(source: string): string {
  switch (source) {
    case '\\"': return '"';
    case '\\\\': return '\\';
    case '\\/': return '/';
    case '\\b': return '\b';
    case '\\f': return '\f';
    case '\\n': return '\n';
    case '\\r': return '\r';
    case '\\t': return '\t';
    default: {
      if (/^\\u[0-9a-fA-F]{4}$/.test(source)) return String.fromCharCode(Number.parseInt(source.slice(2), 16));
      return invalid('scanner found an invalid escape after JSON.parse accepted input');
    }
  }
}

function decodeString(input: ProvenanceText): ProvenanceText {
  const parts: ProvenanceText[] = [];
  let literalStart = 0;
  for (let at = 0; at < input.length; at++) {
    if (input.text[at] !== '\\') continue;
    if (at > literalStart) parts.push(input.slice(literalStart, at));
    const escapeLength = input.text[at + 1] === 'u' ? 6 : 2;
    if (at + escapeLength > input.length) invalid('scanner found a truncated escape after JSON.parse accepted input');
    const raw = input.slice(at, at + escapeLength);
    parts.push(raw.replace(0, raw.length, decodedEscape(raw.text)));
    at += escapeLength - 1;
    literalStart = at + 1;
  }
  if (literalStart < input.length) parts.push(input.slice(literalStart, input.length));
  return input.slice(0, 0).concatAll(parts);
}

function nextNonWhitespace(source: string, at: number): number {
  while (at < source.length && (source[at] === ' ' || source[at] === '\t' || source[at] === '\r' || source[at] === '\n')) at++;
  return at;
}

/**
 * Parse JSON and preserve every string token, including object keys and
 * duplicate values discarded by JSON.parse's resulting object.
 */
export function parseJsonWithStringProvenance(input: ProvenanceText): JsonWithStringProvenance {
  let value: unknown;
  try {
    value = JSON.parse(input.text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return invalid(`invalid JSON: ${detail}`);
  }

  const tokens: JsonStringToken[] = [];
  let depth = 0;
  for (let at = 0; at < input.length; at++) {
    const unit = input.text[at]!;
    if (unit === '{' || unit === '[') {
      depth++;
      continue;
    }
    if (unit === '}' || unit === ']') {
      depth--;
      continue;
    }
    if (unit !== '"') continue;
    const start = at++;
    while (at < input.length) {
      const unit = input.text[at]!;
      if (unit === '"') break;
      if (unit === '\\') at += input.text[at + 1] === 'u' ? 6 : 2;
      else at++;
    }
    if (at >= input.length || input.text[at] !== '"') invalid('scanner found an unterminated string after JSON.parse accepted input');
    const end = at + 1;
    const raw = input.slice(start, end);
    const mappedValue = decodeString(input.slice(start + 1, at));
    let parsedToken: unknown;
    try {
      parsedToken = JSON.parse(raw.text);
    } catch {
      return invalid('scanner found a string JSON.parse could not decode');
    }
    if (typeof parsedToken !== 'string' || parsedToken !== mappedValue.text) {
      return invalid('decoded token differs from JSON.parse');
    }
    const following = nextNonWhitespace(input.text, end);
    tokens.push(Object.freeze({ kind: input.text[following] === ':' ? 'key' : 'value', depth, mappedValue }));
    at = end - 1;
  }
  return Object.freeze({ value, tokens: Object.freeze(tokens) });
}
