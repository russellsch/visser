// Spike 1, test A: bind all Appendix A targets and prove byte spans on LF, CRLF, BOM, and no-EOL variants.
import { readFileSync } from 'node:fs';
import { loadSource, parse, byteRange, collectTargets } from './adapter.mjs';

const variants = ['appendix-a.md', 'appendix-a.crlf.md', 'appendix-a.bom.md', 'appendix-a.noeol.md'];
const results = {};
let allOk = true;

for (const v of variants) {
  const src = loadSource(readFileSync(new URL(`./fixtures/${v}`, import.meta.url)));
  const { ast } = parse(src.text);
  const { targets, errors } = collectTargets(src, ast);
  const rows = [];
  for (const t of targets) {
    const [s, e] = byteRange(src, t.lines[0], t.lines[1]);
    const slice = Buffer.from(src.bytes.subarray(s, e)).toString('utf8');
    const norm = slice.replace(/\r\n?/g, '\n');
    const first = norm.split('\n')[0];
    const isMarker = /^<!-- ex:id /.test(first);
    const startOk = isMarker
      ? first.trim() === `<!-- ex:id ${t.id} -->`
      : first.startsWith(`{% ${t.kind} `) && first.includes(`id="${t.id}"`);
    const body = norm.replace(/\n$/, '');
    const lastLine = body.split('\n').pop();
    const endOk = isMarker
      ? true
      : lastLine === `{% /${t.kind} %}` || (first === lastLine && /\/%\}$/.test(lastLine));
    const eolOk = e === src.bytes.length || /\n$/.test(slice);
    const noTrailingBlank = !/\n\s*\n$/.test(norm);
    const ok = startOk && endOk && eolOk && noTrailingBlank;
    if (!ok) allOk = false;
    rows.push({ id: t.id, kind: t.kind, parent: t.parentId || '', lines: `${t.lines[0] + 1}-${t.lines[1]}`, bytes: `${s}-${e}`, ok, norm });
  }
  results[v] = { rows, errors };
}

const base = results['appendix-a.md'];
console.log(`targets bound: ${base.rows.length} (expected 23); adapter errors: ${JSON.stringify(base.errors)}`);
console.log('id'.padEnd(20), 'kind'.padEnd(11), 'parent'.padEnd(17), 'lines'.padEnd(9), 'LF bytes'.padEnd(11), 'LF', 'CRLF', 'BOM', 'NOEOL');
for (const r of base.rows) {
  const other = (v) => {
    const o = results[v].rows.find((x) => x.id === r.id);
    return o && o.ok && o.norm.replace(/\n$/, '') === r.norm.replace(/\n$/, '') ? 'ok' : 'FAIL';
  };
  console.log(r.id.padEnd(20), r.kind.padEnd(11), r.parent.padEnd(17), r.lines.padEnd(9), r.bytes.padEnd(11),
    r.ok ? 'ok' : 'FAIL', other('appendix-a.crlf.md'), other('appendix-a.bom.md'), other('appendix-a.noeol.md'));
}
const counts = Object.fromEntries(variants.map((v) => [v, results[v].rows.length]));
console.log('target counts per variant:', JSON.stringify(counts));
console.log(`RESULT: ${allOk && base.rows.length === 23 ? 'PASS' : 'FAIL'}`);
