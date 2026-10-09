import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Markdoc from '@markdoc/markdoc';
import { createMathTokenizer } from './adapter.mjs';

const directory = process.argv.includes('--negative') ? 'fixtures/negative' : 'fixtures/positive';
function markdownFiles(base, prefix = '') {
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const path = join(base, entry.name);
    const name = join(prefix, entry.name);
    return entry.isDirectory() ? markdownFiles(path, name) : entry.name.endsWith('.md') ? [name] : [];
  });
}
const names = markdownFiles(directory).sort();
const adapter = createMathTokenizer();
const baselineTokenizer = () => new Markdoc.Tokenizer({ allowComments: true, html: true });

function shape(node) {
  return {
    type: node.type,
    tag: node.tag,
    inline: node.inline,
    attributes: node.attributes,
    lines: node.lines,
    errors: node.errors?.map((e) => ({ id: e.id, message: e.message })) ?? [],
    // Visser discards Markdoc-parsed fence children as part of the current adapter.
    children: node.type === 'fence' ? [] : (node.children ?? []).map(shape),
  };
}

function firstDifference(a, b, path = '$') {
  if (typeof a !== typeof b || a === null || b === null) return Object.is(a, b) ? null : { path, a, b };
  if (typeof a !== 'object') return Object.is(a, b) ? null : { path, a, b };
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const key of keys) {
    const diff = firstDifference(a[key], b[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

const results = names.map((name) => {
  const source = readFileSync(join(directory, name), 'utf8');
  const oldTokens = baselineTokenizer().tokenize(source);
  for (const token of oldTokens) if (token.type === 'fence') token.children = null;
  const old = shape(Markdoc.parse(oldTokens));
  const current = shape(adapter.analyze(source).ast);
  return { name, firstDifference: firstDifference(old, current) };
});
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.firstDifference)) process.exitCode = 1;
