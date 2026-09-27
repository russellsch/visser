// Build the static site that the export browser projects read (§13.5, R10).
//
// 1. A private collection export of every browser example, with the built
//    release as the development toolkit (the same toolkit `serve` uses).
// 2. A public export of a new `visibility: public` document that pins the
//    built release in its lock, so the public export is not a development
//    build. It is copied under `public/` of the same site.
//
// Writes reports/export-site/{collection.json, site/, map.json}. map.json maps
// each example name to its page path inside the site, and `public` to the
// public page. Run: node tests/browser/export-site.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXAMPLES } from './examples.ts';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/explain.cjs');
const work = join(root, 'reports/export-site');
const site = join(work, 'site');

function explain(args, cwd = root) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`explain ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// 1. The private collection.
const collection = join(work, 'collection.json');
writeFileSync(collection, JSON.stringify({
  schema: 'explain-collection/1',
  title: 'Explain examples',
  documents: EXAMPLES.map((name) => ({ path: `../../examples/${name}` })),
}, null, 2));
const report = JSON.parse(explain(['export', '--collection', collection, '--format', 'site', '--out', site, '--dev-toolkit', join(root, 'dist/release'), '--json']));

const map = {};
for (const name of EXAMPLES) {
  const docId = /^docId: (\S+)$/m.exec(readFileSync(join(root, 'examples', name, 'index.md'), 'utf8'))?.[1];
  const doc = report.documents.find((d) => d.docId === docId);
  if (!doc) throw new Error(`the export report has no document for ${name}`);
  map[name] = doc.path;
}

// 2. A public document in a new repository, exported without a development toolkit.
const repo = mkdtempSync(join(tmpdir(), 'explain-public-'));
mkdirSync(join(repo, '.explain'));
const docDir = join(repo, 'docs/public-notes');
explain(['init', docDir, '--kind', 'teaching', '--title', 'Public notes'], repo);
const indexPath = join(docDir, 'index.md');
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('visibility: private', 'visibility: public')
  + '\nA public page that the static host serves under a project prefix.\n');
explain(['ids', 'assign', indexPath], repo);
const publicOut = join(repo, 'site');
const publicReport = JSON.parse(explain(['export', indexPath, '--format', 'site', '--audience', 'public', '--out', publicOut, '--json'], repo));
cpSync(publicOut, join(site, 'public'), { recursive: true });
map.public = `public/${publicReport.documents[0].path}`;
rmSync(repo, { recursive: true, force: true });

writeFileSync(join(work, 'map.json'), JSON.stringify(map, null, 2) + '\n');
process.stdout.write(`exported ${EXAMPLES.length} examples and one public page to ${site}\n`);
