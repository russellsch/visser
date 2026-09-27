import * as tar from 'tar';
import { existsSync, mkdirSync, readdirSync, rmSync, lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ARCH = 'tmp/arch';
function walk(d) { const out = []; for (const n of readdirSync(d)) { const f = join(d, n); out.push(f); if (lstatSync(f).isDirectory() && !lstatSync(f).isSymbolicLink()) out.push(...walk(f)); } return out; }
// Strict pre-scan per §12.1: reject the WHOLE archive on any bad header.
async function prescan(file) {
  const problems = []; const seen = new Map(); let total = 0;
  await tar.t({ file, onReadEntry: (e) => {
    const p = e.path; const type = e.type;
    if (!['File', 'Directory'].includes(type)) problems.push(`type ${type}: ${p}`);
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) problems.push(`absolute: ${p}`);
    if (p.split('/').some((s) => s === '..')) problems.push(`traversal: ${p}`);
    if (p.normalize('NFC') !== p) problems.push(`non-NFC: ${JSON.stringify(p)}`);
    const key = p.normalize('NFC').toLowerCase();
    if (seen.has(key)) problems.push(`duplicate/collision: ${p} vs ${seen.get(key)}`); else seen.set(key, p);
    total += e.size ?? 0;
    e.resume();
  } });
  if (total > 256 * 1024 * 1024) problems.push(`extracted size ${total} > 256 MiB`);
  return problems;
}
for (const name of readdirSync(ARCH).sort()) {
  const file = join(ARCH, name);
  const box = join('tmp/x', name); rmSync(box, { recursive: true, force: true });
  const root = join(box, 'a', 'b', 'root'); mkdirSync(root, { recursive: true });
  const warnings = [];
  let outcome = 'extracted';
  try {
    await tar.x({ file, cwd: root, onwarn: (code, msg) => warnings.push(`${code}: ${msg}`.slice(0, 80)) });
  } catch (e) { outcome = `threw ${e.code ?? ''} ${String(e.message).slice(0, 120)}`; }
  const outside = walk(box).filter((f) => !f.startsWith(root) && f !== join(box, 'a') && f !== join(box, 'a', 'b'));
  if (existsSync('/tmp/p4b-absolute.txt')) { outside.push('/tmp/p4b-absolute.txt'); rmSync('/tmp/p4b-absolute.txt'); }
  const inside = walk(root).map((f) => f.slice(root.length + 1) + (lstatSync(f).isSymbolicLink() ? ' (symlink)' : ''));
  let problems;
  try { problems = await prescan(file); } catch (e) { problems = [`pre-scan threw ${e.code ?? ''} ${String(e.message).slice(0, 120)}`]; }
  console.log(`\n## ${name}\n  default tar.x: ${outcome}; warnings=${JSON.stringify(warnings)}\n  written OUTSIDE root: ${JSON.stringify(outside)}\n  inside root: ${JSON.stringify(inside.slice(0, 6))}${inside.length > 6 ? ' …' : ''}\n  strict pre-scan: ${problems.length ? 'REJECT ' + JSON.stringify(problems) : 'accept'}`);
}
