// Spike: hostile repositories vs the §8.2 capture path. Run: node attack.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { captureGit, captureWorkingTree, gitEnv, git, CaptureError } from './capture.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TMP = path.join(HERE, 'tmp');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const SENT = path.join(TMP, 'sentinels');
fs.mkdirSync(SENT);

// Plain git for fixture setup only (never with hostile config active yet).
function sh(cwd, args, env = {}) {
  const r = spawnSync('git', args, { cwd, env: { ...gitEnv(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', ...env }, shell: false, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`setup git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
function script(name) {
  const p = path.join(TMP, `evil-${name}.sh`);
  fs.writeFileSync(p, `#!/bin/sh\ntouch "${SENT}/${name}"\ncat\n`, { mode: 0o755 });
  return p;
}
function fired(name) { return fs.existsSync(path.join(SENT, name)); }
function reset() { for (const f of fs.readdirSync(SENT)) fs.rmSync(path.join(SENT, f)); }

function mkRepo(name, { format } = {}) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir);
  sh(dir, ['init', '-q', ...(format ? [`--object-format=${format}`] : []), '-b', 'main']);
  sh(dir, ['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nline2\nline3\n');
  sh(dir, ['add', '.']); sh(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}
const cfg = (dir, k, v) => sh(dir, ['config', k, v]);
const naive = (dir, args, extraEnv = {}) =>
  spawnSync('git', args, { cwd: dir, env: { ...process.env, ...extraEnv }, shell: false, encoding: 'utf8' });
function spec(dir, extra = {}) {
  try { return captureGit({ repo: dir, rev: 'HEAD', file: 'a.txt', start: 1, end: 2, ...extra }); }
  catch (e) { return e; }
}

const rows = [];
function vector(id, name, setup, naiveRun, specRun = (d) => spec(d)) {
  reset();
  const dir = mkRepo(id);
  setup(dir);
  reset();
  let naiveFired = 'n/a';
  if (naiveRun) { naiveRun(dir); naiveFired = fs.readdirSync(SENT).length ? `YES (${fs.readdirSync(SENT)})` : 'no'; }
  reset();
  const r = specRun(dir);
  const specFired = fs.readdirSync(SENT).length ? `YES (${fs.readdirSync(SENT)})` : 'no';
  const outcome = r instanceof Error ? `error ${r.message.slice(0, 60)}` : (r?.excerptRaw ? `ok ${JSON.stringify(r.excerptRaw.toString())}` : String(r));
  rows.push({ id, name, naive: naiveFired, spec: specFired, outcome });
}

// V1 fsmonitor (repo-local config)
vector('v1-fsmonitor', 'core.fsmonitor=<script>', d => cfg(d, 'core.fsmonitor', script('fsmonitor')),
  d => naive(d, ['status']));
// V1b fsmonitor via include.path
vector('v1b-include', 'include.path -> config with fsmonitor', d => {
  const inc = path.join(TMP, 'inc.cfg');
  fs.writeFileSync(inc, `[core]\n\tfsmonitor = ${script('fsmonitor_inc')}\n`);
  cfg(d, 'include.path', inc);
}, d => naive(d, ['status']));
// V1c fsmonitor via includeIf gitdir
vector('v1c-includeif', 'includeIf gitdir -> fsmonitor', d => {
  const inc = path.join(TMP, 'incif.cfg');
  fs.writeFileSync(inc, `[core]\n\tfsmonitor = ${script('fsmonitor_incif')}\n`);
  cfg(d, `includeIf.gitdir:${d}/.git.path`, inc);
}, d => naive(d, ['status']));
// V2 hooks
vector('v2-hooks', 'core.hooksPath hooks (post-checkout, reference-transaction, post-index-change)', d => {
  const hd = path.join(d, '.evilhooks'); fs.mkdirSync(hd);
  for (const h of ['post-checkout', 'reference-transaction', 'post-index-change', 'pre-auto-gc', 'post-rewrite'])
    fs.copyFileSync(script(`hook_${h}`), path.join(hd, h)), fs.chmodSync(path.join(hd, h), 0o755);
  cfg(d, 'core.hooksPath', hd);
}, d => naive(d, ['checkout', '-q', '-b', 'x']));
// V3 textconv
vector('v3-textconv', '.gitattributes diff=evil + diff.evil.textconv', d => {
  fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt diff=evil filter=evil\n');
  sh(d, ['add', '.gitattributes']); sh(d, ['commit', '-q', '-m', 'attrs']);
  cfg(d, 'diff.evil.textconv', script('textconv'));
}, d => naive(d, ['show', '--textconv', 'HEAD:a.txt']));
vector('v3b-show-default', 'textconv: plain `git show HEAD:a.txt` (no flag)', d => {
  fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt diff=evil\n');
  sh(d, ['add', '.gitattributes']); sh(d, ['commit', '-q', '-m', 'attrs']);
  cfg(d, 'diff.evil.textconv', script('textconv_show'));
}, d => naive(d, ['show', 'HEAD:a.txt']));
vector('v3c-catfile-textconv', 'textconv: `git cat-file --textconv HEAD:a.txt`', d => {
  fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt diff=evil\n');
  sh(d, ['add', '.gitattributes']); sh(d, ['commit', '-q', '-m', 'attrs']);
  cfg(d, 'diff.evil.textconv', script('textconv_cf'));
}, d => naive(d, ['cat-file', '--textconv', 'HEAD:a.txt']));
vector('v3d-filters', 'filter.evil.smudge via `cat-file --filters`', d => {
  fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt filter=evil\n');
  sh(d, ['add', '.gitattributes']); sh(d, ['commit', '-q', '-m', 'attrs']);
  cfg(d, 'filter.evil.smudge', script('smudge')); cfg(d, 'filter.evil.clean', script('clean'));
}, d => naive(d, ['cat-file', '--filters', 'HEAD:a.txt']));
vector('v3e-diffext', 'diff.external', d => {
  cfg(d, 'diff.external', script('diffext'));
  fs.appendFileSync(path.join(d, 'a.txt'), 'dirty\n');
}, d => naive(d, ['diff']));
// V4 pager / editor / credential / ssh
vector('v4-pager', 'core.pager + pager.log (non-tty)', d => {
  cfg(d, 'core.pager', script('pager')); cfg(d, 'pager.log', script('pager_log'));
}, d => naive(d, ['log', '-1']));
vector('v4b-pager-forced', 'core.pager with `git -p log` (forced paging)', d => {
  cfg(d, 'core.pager', script('pager_forced'));
}, d => naive(d, ['-p', 'log', '-1']));
vector('v4c-misc', 'core.editor, credential.helper, core.sshCommand, core.gitProxy, core.alternateRefsCommand, uploadpack.packObjectsHook', d => {
  cfg(d, 'core.editor', script('editor')); cfg(d, 'credential.helper', `!${script('cred')}`);
  cfg(d, 'core.sshCommand', script('ssh')); cfg(d, 'core.gitProxy', script('proxy'));
  cfg(d, 'core.alternateRefsCommand', script('altrefs')); cfg(d, 'uploadpack.packObjectsHook', script('pack'));
}, null);
// V6 GIT_DIR / env injection from parent environment
vector('v6-gitdir-env', 'GIT_DIR/GIT_CONFIG_* inherited from parent env', d => {
  const other = mkRepo('v6-other');
  fs.writeFileSync(path.join(other, 'a.txt'), 'OTHER1\nOTHER2\n');
  sh(other, ['add', '.']); sh(other, ['commit', '-q', '-m', 'other']);
  process.env.__OTHER = path.join(other, '.git');
}, d => {
  const r = naive(d, ['show', 'HEAD:a.txt'], { GIT_DIR: process.env.__OTHER });
  if (r.stdout.includes('OTHER')) fs.writeFileSync(path.join(SENT, 'naive_read_other_repo'), '');
}, d => {
  const saved = process.env.GIT_DIR; process.env.GIT_DIR = process.env.__OTHER;
  try { return spec(d); } finally { if (saved === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = saved; }
});
vector('v6b-gitfile', '.git is a gitfile pointing to another repo', d => {
  const other = mkRepo('v6b-other');
  fs.writeFileSync(path.join(other, 'a.txt'), 'OTHER1\nOTHER2\n');
  sh(other, ['add', '.']); sh(other, ['commit', '-q', '-m', 'other']);
  fs.rmSync(path.join(d, '.git'), { recursive: true });
  fs.writeFileSync(path.join(d, '.git'), `gitdir: ${path.join(other, '.git')}\n`);
}, null);
vector('v6c-alternates', 'objects/info/alternates -> outside repo', d => {
  const other = mkRepo('v6c-other');
  fs.writeFileSync(path.join(d, '.git/objects/info/alternates'), path.join(other, '.git/objects') + '\n');
}, null, d => {
  // Can a rev resolve an object that exists only in the alternate?
  const otherHead = sh(path.join(TMP, 'v6c-other'), ['rev-parse', 'HEAD']).trim();
  return spec(d, { rev: otherHead });
});

// V5 option injection
const inj = [];
{
  const d = mkRepo('v5-inject');
  const out = path.join(TMP, 'injected-output');
  for (const rev of [`--output=${out}`, '-h', '--exec=touch x', '--all']) {
    let viaSpec; try { captureGit({ repo: d, rev, file: 'a.txt', start: 1, end: 1 }); viaSpec = 'accepted'; }
    catch (e) { viaSpec = e.code; }
    // Without the leading-dash check: does --end-of-options alone neutralize it?
    const raw = git(d, ['rev-parse', '--verify', '--end-of-options', `${rev}^{commit}`]);
    const rawCat = git(d, ['cat-file', '-t', '--end-of-options', rev]);
    // Naive: git show <rev> without --end-of-options
    fs.rmSync(out, { force: true });
    const nv = naive(d, ['show', rev]);
    inj.push({ rev, spec: viaSpec, revparseEOO: raw.status === 0 ? 'resolved?!' : 'rejected',
      catfileEOO: rawCat.status === 0 ? 'accepted?!' : 'rejected',
      naiveShow: fs.existsSync(out) ? 'WROTE FILE' : `exit ${nv.status}` });
  }
  // path beginning with '-' inside <commit>:<path>
  fs.writeFileSync(path.join(d, '-dash.txt'), 'dash1\n'); sh(d, ['add', '--', '-dash.txt']); sh(d, ['commit', '-q', '-m', 'dash']);
  let r; try { r = captureGit({ repo: d, rev: 'HEAD', file: '-dash.txt', start: 1, end: 1 }).excerptRaw.toString(); } catch (e) { r = e.message; }
  inj.push({ rev: 'path "-dash.txt"', spec: JSON.stringify(r), revparseEOO: '', catfileEOO: '', naiveShow: '' });
}

// V7 correctness
const corr = [];
function check(name, fn) { try { corr.push([name, fn()]); } catch (e) { corr.push([name, `THREW ${e.message}`]); } }
check('sha256 object format', () => {
  const d = mkRepo('v7-sha256', { format: 'sha256' });
  const r = captureGit({ repo: d, rev: 'HEAD', file: 'a.txt', start: 2, end: 3 });
  return `commit len ${r.commit.length}, excerpt ${JSON.stringify(r.excerptRaw.toString())}`;
});
check('detached HEAD', () => {
  const d = mkRepo('v7-detached');
  sh(d, ['checkout', '-q', '--detach']);
  return JSON.stringify(captureGit({ repo: d, rev: 'HEAD', file: 'a.txt', start: 1, end: 1 }).excerptRaw.toString());
});
check('non-ASCII + space path', () => {
  const d = mkRepo('v7-unicode');
  const f = 'dir with space/ñandú 😀.txt';
  fs.mkdirSync(path.join(d, 'dir with space'));
  fs.writeFileSync(path.join(d, f), 'uni1\nuni2\n');
  sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 'u']);
  return JSON.stringify(captureGit({ repo: d, rev: 'HEAD', file: f, start: 2, end: 2 }).excerptRaw.toString());
});
check('CRLF raw + normalized hash', () => {
  const d = mkRepo('v7-crlf');
  fs.writeFileSync(path.join(d, 'c.txt'), 'a\r\nb\r\nc\r\n');
  sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 'crlf']);
  const r = captureGit({ repo: d, rev: 'HEAD', file: 'c.txt', start: 1, end: 2 });
  const lf = captureGit({ repo: d, rev: 'HEAD~1', file: 'a.txt', start: 1, end: 1 }); // unrelated
  return `raw=${JSON.stringify(r.excerptRaw.toString())} sha(norm "a\\nb\\n")=${r.excerptSha256.slice(0, 12)} expect=${
    (await_hash('a\nb\n')).slice(0, 12)}`;
});
function await_hash(t) { return spawnSync('sh', ['-c', `printf '${t.replace(/\n/g, '\\n')}' | sha256sum`], { encoding: 'utf8' }).stdout.slice(0, 64); }
check('range beyond EOF rejected', () => { try { captureGit({ repo: path.join(TMP, 'v7-detached'), rev: 'HEAD', file: 'a.txt', start: 3, end: 9 }); return 'ACCEPTED'; } catch (e) { return e.code; } });
check('empty file / empty excerpt rejected', () => {
  const d = mkRepo('v7-empty');
  fs.writeFileSync(path.join(d, 'e.txt'), ''); sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 'e']);
  try { captureGit({ repo: d, rev: 'HEAD', file: 'e.txt', start: 1, end: 1 }); return 'ACCEPTED'; } catch (e) { return e.code; }
});
check('binary rejected', () => {
  const d = mkRepo('v7-bin');
  fs.writeFileSync(path.join(d, 'b.bin'), Buffer.from([0x61, 0x00, 0x0a])); sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 'b']);
  try { captureGit({ repo: d, rev: 'HEAD', file: 'b.bin', start: 1, end: 1 }); return 'ACCEPTED'; } catch (e) { return e.code; }
});
check('invalid UTF-8 rejected', () => {
  const d = mkRepo('v7-latin1');
  fs.writeFileSync(path.join(d, 'l.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])); sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 'l']);
  try { captureGit({ repo: d, rev: 'HEAD', file: 'l.txt', start: 1, end: 1 }); return 'ACCEPTED'; } catch (e) { return e.code; }
});
check('committed capture ignores dirty worktree', () => {
  const d = mkRepo('v7-dirty');
  fs.writeFileSync(path.join(d, 'a.txt'), 'CHANGED\n');
  return JSON.stringify(captureGit({ repo: d, rev: 'HEAD', file: 'a.txt', start: 1, end: 1 }).excerptRaw.toString());
});
check('path is a tree, not a blob', () => {
  const d = mkRepo('v7-tree'); fs.mkdirSync(path.join(d, 'sub')); fs.writeFileSync(path.join(d, 'sub/x'), 'x\n');
  sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 't']);
  try { captureGit({ repo: d, rev: 'HEAD', file: 'sub', start: 1, end: 1 }); return 'ACCEPTED'; } catch (e) { return e.message.slice(0, 50); }
});
check('working-tree symlink rejected', () => {
  const d = mkRepo('v7-symlink');
  fs.writeFileSync(path.join(TMP, 'secret.txt'), 'SECRET\n');
  fs.symlinkSync(path.join(TMP, 'secret.txt'), path.join(d, 'link.txt'));
  try { captureWorkingTree({ repo: d, file: 'link.txt', start: 1, end: 1 }); return 'ACCEPTED'; } catch (e) { return e.code; }
});
check('working-tree regular file ok', () => {
  const d = path.join(TMP, 'v7-dirty');
  return JSON.stringify(captureWorkingTree({ repo: d, file: 'a.txt', start: 1, end: 1 }).excerptRaw.toString());
});
check('committed symlink blob (link target text, not followed)', () => {
  const d = mkRepo('v7-commitlink');
  fs.symlinkSync('/etc/hostname', path.join(d, 'l')); sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 'l']);
  const r = captureGit({ repo: d, rev: 'HEAD', file: 'l', start: 1, end: 1 });
  return `captured ${JSON.stringify(r.excerptRaw.toString())} (a symlink blob is the link path, mode 120000)`;
});

console.log('\n== Execution vectors ==');
console.table(rows);
console.log('\n== Option injection ==');
console.table(inj);
console.log('\n== Correctness ==');
for (const [k, v] of corr) console.log(`${k.padEnd(48)} ${v}`);
