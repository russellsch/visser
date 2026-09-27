// Writing a captured `source` block into a document (§8.2 "Writing the source
// block"). Every write goes through the §11.9 guarded write.
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LoadedBundle } from '../model/bundle.ts';
import { HashError, TARGET_ID } from '../model/hash.ts';
import { detectNewline } from '../syntax/index.ts';
import { findRepoRoot } from '../references/registry.ts';
import { guardedWrite, isInside } from '../references/guarded-write.ts';
import type { FsContext } from '../references/fs-context.ts';
import { loadBundle } from '../model/bundle.ts';

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

export type SourceAttributes = {
  id: string;
  kind: 'git' | 'working-tree' | 'web' | 'file' | 'supplied' | 'example';
  title: string;
  language?: string;
  repository?: string;
  commit?: string;
  baseCommit?: string;
  file?: string;
  start?: number;
  end?: number;
  symbol?: string;
  url?: string;
  capturedAt?: string;
  asset?: string;
  excerptSha256: string;
  originFileSha256?: string;
};

export type SourceBody = { text: string } | { asset: { path: string; bytes: Uint8Array } };

const ATTRIBUTE_ORDER: ReadonlyArray<keyof SourceAttributes> = [
  'id', 'kind', 'title', 'language', 'repository', 'commit', 'baseCommit', 'file', 'start', 'end',
  'symbol', 'url', 'capturedAt', 'asset', 'excerptSha256', 'originFileSha256',
];

/** Extension → fence language. Unknown extensions get no language. */
const LANGUAGES: Record<string, string> = {
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', go: 'go', java: 'java', js: 'javascript', mjs: 'javascript',
  cjs: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript', py: 'python', rb: 'ruby', rs: 'rust', sh: 'bash',
  bash: 'bash', zsh: 'bash', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', md: 'markdown', html: 'html',
  css: 'css', kt: 'kotlin', swift: 'swift', php: 'php', txt: 'text', log: 'text',
};

const LANGUAGE = /^[a-z0-9][a-z0-9+#.-]{0,31}$/;

export function languageFor(path: string | undefined, explicit: string | undefined): string | undefined {
  if (explicit !== undefined) {
    if (!LANGUAGE.test(explicit)) fail('E_USAGE', `--language ${JSON.stringify(explicit)} must match ${LANGUAGE}`);
    return explicit;
  }
  const ext = path ? /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() : undefined;
  return ext ? LANGUAGES[ext] : undefined;
}

/** A backtick fence one longer than the longest backtick run in `text`, minimum three. */
export function fenceFor(text: string): string {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The `{% source %}` block text with LF line endings, ending with one LF. */
export function sourceBlock(attrs: SourceAttributes, body: SourceBody): string {
  const parts: string[] = [];
  for (const key of ATTRIBUTE_ORDER) {
    const value = attrs[key];
    if (value === undefined) continue;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value < 1) fail('E_USAGE', `${key} must be a positive integer`);
      parts.push(`${key}=${value}`);
    } else {
      // JSON string encoding: quotes, backslashes, `%}`, and newlines cannot end the tag.
      parts.push(`${key}=${JSON.stringify(value)}`);
    }
  }
  const open = `{% source ${parts.join(' ')}`;
  if ('asset' in body) return `${open} /%}\n`;
  const fence = fenceFor(body.text);
  return `${open} %}\n${fence}${attrs.language ?? ''}\n${body.text}${fence}\n{% /source %}\n`;
}

export type WriteSourceOptions = {
  indexPath: string;
  attrs: SourceAttributes;
  body: SourceBody;
  recapture: boolean;
  fsContext?: FsContext;
};

export type WriteSourceResult = {
  docId: string;
  id: string;
  replaced: boolean;
  oldRevision: string;
  newRevision: string;
  asset?: string;
};

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Write an asset file inside the bundle: no symlinks on the way, no overwrite. */
function writeAsset(bundleRoot: string, rel: string, bytes: Uint8Array): void {
  const parts = rel.split('/');
  let dir = bundleRoot;
  for (const segment of parts.slice(0, -1)) {
    dir = join(dir, segment);
    if (isSymlink(dir)) fail('E_PATH_ESCAPE', `${segment}/ in the bundle is a symbolic link`);
    if (!existsSync(dir)) mkdirSync(dir, { mode: 0o755 });
  }
  if (!isInside(realpathSync(dir), realpathSync(bundleRoot))) fail('E_PATH_ESCAPE', `${rel} is outside the bundle`);
  const fd = openSync(join(bundleRoot, rel), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644);
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Insert (or with `recapture`, replace) a `source` block. A new block goes
 * after the last top-level source block, or at the end of the document under the §11.9
 * guarded write. The candidate must be a valid document whose target set is
 * the old set plus the new ID, so captured text cannot add targets.
 */
export function writeSource(opts: WriteSourceOptions): WriteSourceResult {
  const { indexPath, attrs, body } = opts;
  if (!TARGET_ID.test(attrs.id)) fail('E_USAGE', `--id ${JSON.stringify(attrs.id)} does not match the ID grammar (§6.3)`);
  if (isSymlink(indexPath)) fail('E_PATH_ESCAPE', 'the document is a symbolic link');
  const bundleRoot = dirname(indexPath);
  const first = loadBundle(indexPath);
  if (!first.docId) fail('E_SYNTAX', 'the document has no docId');
  const repoRoot = findRepoRoot(bundleRoot) ?? bundleRoot;

  let before: LoadedBundle | undefined;
  let replaced = false;
  let assetTarget: string | undefined;
  let assetWritten = false;
  let assetBackup: string | undefined;
  try {
    const { after } = guardedWrite({ repoRoot, docId: first.docId, indexPath, ...(opts.fsContext ? { fsContext: opts.fsContext } : {}) }, () => {
      // No pre-check of the current document: an author often cites a source
      // before capturing it (E_REF_BROKEN until now). The guarded write
      // requires the candidate document to be fully valid instead.
      const bundle = loadBundle(indexPath);
      const original = bundle.parsed.rawBytes;
      const newline = detectNewline(original) === '\r\n' ? '\r\n' : '\n';
      const block = sourceBlock(attrs, body).replace(/\n/g, newline);
      const existing = bundle.model.targets.get(attrs.id);
      let candidateText: string;
      const text = Buffer.from(original).toString('utf8');
      if (existing) {
        if (existing.kind !== 'source' || existing.parentId !== undefined || !opts.recapture) {
          fail('E_ID_DUPLICATE', `${attrs.id} already exists${existing.kind === 'source' ? '; pass --recapture to replace it' : ` as a ${existing.kind}`}`);
        }
        const bytes = Buffer.from(original);
        candidateText = bytes.subarray(0, existing.span.startByte).toString('utf8') + block + bytes.subarray(existing.span.endByte).toString('utf8');
        replaced = true;
      } else {
        // After the last top-level source, so the file lists sources in capture order.
        const sources = [...bundle.model.targets.values()].filter((t) => t.kind === 'source' && t.parentId === undefined);
        const lastSource = sources.sort((a, b) => a.span.endByte - b.span.endByte).at(-1);
        const bytes = Buffer.from(original);
        if (lastSource) {
          const at = lastSource.span.endByte;
          const head = bytes.subarray(0, at).toString('utf8');
          candidateText = head + (head.endsWith('\n') ? '' : newline) + newline + block + bytes.subarray(at).toString('utf8');
        } else {
          const base = text.endsWith('\n') ? text : text + newline;
          candidateText = base + newline + block;
        }
      }
      if ('asset' in body) {
        const target = join(bundleRoot, body.asset.path);
        assetTarget = target;
        if (existsSync(target) || isSymlink(target)) {
          if (!replaced) fail('E_ID_DUPLICATE', `${body.asset.path} already exists`);
          if (isSymlink(target)) fail('E_PATH_ESCAPE', `${body.asset.path} is a symbolic link`);
          assetBackup = `${target}.${process.pid}.bak`;
          renameSync(target, assetBackup);
        }
        writeAsset(bundleRoot, body.asset.path, body.asset.bytes);
        assetWritten = true;
      }
      before = bundle;
      const expected = new Set([...bundle.model.targets.keys(), attrs.id]);
      return {
        original,
        candidate: new Uint8Array(Buffer.from(candidateText, 'utf8')),
        validate: (next) => {
          // A candidate with errors fails in the guarded write with its own code.
          if (next.diagnostics.some((d) => d.severity === 'error')) return;
          const ids = new Set(next.model.targets.keys());
          const extra = [...ids].filter((id) => !expected.has(id));
          const missing = [...expected].filter((id) => !ids.has(id) && !(replaced && bundle.model.targets.get(id)?.parentId === attrs.id));
          if (extra.length > 0 || missing.length > 0) {
            fail('E_UNSAFE_CONTENT', `the capture would change the document's targets (added: ${extra.join(', ') || 'none'}; removed: ${missing.join(', ') || 'none'})`);
          }
          if (next.model.targets.get(attrs.id)?.kind !== 'source') fail('E_UNSAFE_CONTENT', `the capture did not produce source ${attrs.id}`);
        },
      };
    });
    if (assetBackup) rmSync(assetBackup, { force: true });
    return {
      docId: first.docId,
      id: attrs.id,
      replaced,
      oldRevision: before!.sourceRevision ?? '',
      newRevision: after.sourceRevision ?? '',
      ...('asset' in body ? { asset: body.asset.path } : {}),
    };
  } catch (error) {
    if (assetTarget && assetWritten) rmSync(assetTarget, { force: true });
    if (assetTarget && assetBackup) renameSync(assetBackup, assetTarget);
    throw error;
  }
}
