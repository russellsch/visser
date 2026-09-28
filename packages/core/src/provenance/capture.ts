// `capture git` and `capture file` (§8.1, §8.2, §8.4, §17.1).
import { lstatSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadBundle } from '../model/bundle.ts';
import { HashError, sha256Hex } from '../model/hash.ts';
import type { FsContext } from '../references/fs-context.ts';
import { headCommit, MAX_CAPTURE_BYTES, openRepository, parseLineRange, readBlobAt, readWorkingTreeFile, resolveCommit } from './git.ts';
import { repositoryIdentity } from './identity.ts';
import { extractExcerpt, wholeExcerpt } from './text.ts';
import { languageFor, type SourceAttributes, writeSource, type WriteSourceResult } from './write.ts';

/**
 * A source already in the document that captures the same material: the same
 * excerpt bytes, the same asset path, or the same file and line range. A
 * match is a warning, not an error (dogfood-3 F13): a second capture of the
 * same lines under a new ID is valid, just probably not what the author
 * meant.
 */
function duplicateSourceWarning(doc: string, attrs: SourceAttributes): string | undefined {
  let bundle;
  try {
    bundle = loadBundle(doc);
  } catch {
    return undefined;
  }
  const match = bundle.parsed.targets.find((t) => {
    if (t.tagName !== 'source' || t.id === attrs.id) return false;
    const a = t.attributes;
    if (typeof a['excerptSha256'] === 'string' && a['excerptSha256'] === attrs.excerptSha256) return true;
    if (attrs.asset !== undefined && a['asset'] === attrs.asset) return true;
    return attrs.file !== undefined && a['file'] === attrs.file && a['start'] === attrs.start && a['end'] === attrs.end;
  });
  return match ? `W_DUPLICATE_SOURCE: ${attrs.id} captures the same file, lines, and content as existing source ${match.id}` : undefined;
}

/** The first three lines of an excerpt, for `--dry-run` (dogfood-3 F13). */
function excerptPreview(text: string): string[] {
  return text.split(/\r\n|\n/).slice(0, 3);
}

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** An explicit `--captured-at` (UTC, RFC 3339 with Z) or the current time in whole seconds. */
export function capturedAtValue(explicit: string | undefined, now: () => Date = () => new Date()): string {
  if (explicit !== undefined) {
    if (!TIMESTAMP.test(explicit) || Number.isNaN(Date.parse(explicit))) fail('E_USAGE', `--captured-at ${JSON.stringify(explicit)} must be a UTC timestamp such as 2026-09-27T12:00:00Z`);
    return explicit;
  }
  return now().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// C0, DEL, C1, and the Unicode line and paragraph separators: none may enter a
// one-line attribute, even though JSON encoding would keep the tag intact.
const UNSAFE_LINE_CHARS = /[\0-\x1f\x7f-\x9f\u2028\u2029]/;

function checkTitle(title: string): void {
  if (title.trim() === '' || title.length > 200 || UNSAFE_LINE_CHARS.test(title)) fail('E_USAGE', '--title must be one line of 1 to 200 characters');
}

function checkSymbol(symbol: string | undefined): void {
  if (symbol !== undefined && (symbol === '' || symbol.length > 200 || UNSAFE_LINE_CHARS.test(symbol))) fail('E_USAGE', '--symbol must be one line of 1 to 200 characters');
}

export type CaptureGitRequest = {
  repo: string;
  rev?: string; // committed capture (default HEAD)
  workingTree?: boolean;
  file: string;
  lines: string;
  doc: string;
  id: string;
  title: string;
  repositoryLabel?: string;
  language?: string;
  symbol?: string;
  capturedAt?: string;
  recapture?: boolean;
  allowAlternates?: boolean;
  allowExternalGitdir?: boolean;
  fsContext?: FsContext;
  /** Compute and report what would be written, but write nothing (dogfood-3 F13). */
  dryRun?: boolean;
};

export type CaptureResult = WriteSourceResult & {
  attributes: SourceAttributes;
  /** Non-fatal findings, such as W_DUPLICATE_SOURCE, worth printing to stderr. */
  warnings: string[];
  dryRun?: boolean;
  /** Only with `dryRun`: the first three lines of the excerpt (empty for an image asset). */
  excerptPreview?: string[];
};

export function captureGit(req: CaptureGitRequest): CaptureResult {
  checkTitle(req.title);
  checkSymbol(req.symbol);
  const range = parseLineRange(req.lines);
  const repo = openRepository(req.repo, { ...(req.allowAlternates ? { allowAlternates: true } : {}), ...(req.allowExternalGitdir ? { allowExternalGitdir: true } : {}) });
  const language = languageFor(req.file, req.language);
  const capturedAt = capturedAtValue(req.capturedAt);

  let attrs: SourceAttributes;
  let text: string;
  if (req.workingTree) {
    if (req.rev !== undefined) fail('E_USAGE', '--rev and --working-tree cannot be combined');
    const bytes = readWorkingTreeFile(repo, req.file);
    const excerpt = extractExcerpt(bytes, range.start, range.end);
    const base = headCommit(repo);
    // Repository identity is optional for working-tree material (§8.1), but an
    // explicit label must still be valid.
    let repository: string | undefined;
    if (req.repositoryLabel !== undefined) {
      repository = repositoryIdentity(repo, req.repositoryLabel);
    } else {
      try {
        repository = repositoryIdentity(repo, undefined);
      } catch {
        repository = undefined;
      }
    }
    text = excerpt.text;
    attrs = {
      id: req.id, kind: 'working-tree', title: req.title,
      ...(language ? { language } : {}),
      ...(repository ? { repository } : {}),
      ...(base ? { baseCommit: base } : {}),
      file: req.file, start: excerpt.start, end: excerpt.end,
      ...(req.symbol ? { symbol: req.symbol } : {}),
      capturedAt, excerptSha256: excerpt.excerptSha256, originFileSha256: sha256Hex(bytes),
    };
  } else {
    const repository = repositoryIdentity(repo, req.repositoryLabel);
    const commit = resolveCommit(repo, req.rev ?? 'HEAD');
    const read = readBlobAt(repo, commit, req.file);
    const excerpt = extractExcerpt(read.bytes, range.start, range.end);
    text = excerpt.text;
    attrs = {
      id: req.id, kind: 'git', title: req.title,
      ...(language ? { language } : {}),
      repository, commit, file: req.file, start: excerpt.start, end: excerpt.end,
      ...(req.symbol ? { symbol: req.symbol } : {}),
      capturedAt, excerptSha256: excerpt.excerptSha256, originFileSha256: sha256Hex(read.bytes),
    };
  }
  const warning = duplicateSourceWarning(req.doc, attrs);
  const warnings = warning ? [warning] : [];
  if (req.dryRun) {
    const bundle = loadBundle(req.doc);
    return {
      docId: bundle.docId ?? '', id: attrs.id, replaced: false,
      oldRevision: bundle.sourceRevision ?? '', newRevision: bundle.sourceRevision ?? '',
      attributes: attrs, warnings, dryRun: true, excerptPreview: excerptPreview(text),
    };
  }
  const result = writeSource({ indexPath: req.doc, attrs, body: { text }, recapture: req.recapture === true, ...(req.fsContext ? { fsContext: req.fsContext } : {}) });
  return { ...result, attributes: attrs, warnings };
}

// ---------------------------------------------------------------------------
// capture file

const RASTER: Array<{ ext: string; magic: (b: Uint8Array) => boolean }> = [
  { ext: 'png', magic: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  { ext: 'jpg', magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', magic: (b) => b.length > 12 && Buffer.from(b.subarray(0, 4)).toString('latin1') === 'RIFF' && Buffer.from(b.subarray(8, 12)).toString('latin1') === 'WEBP' },
];

export function rasterExtension(bytes: Uint8Array): string | undefined {
  return RASTER.find((r) => r.magic(bytes))?.ext;
}

export type CaptureFileRequest = {
  from: string;
  kind: 'file' | 'web' | 'supplied' | 'example';
  doc: string;
  id: string;
  title: string;
  lines?: string;
  label?: string; // origin label recorded as `file` (never an absolute path)
  url?: string;
  language?: string;
  capturedAt?: string;
  recapture?: boolean;
  fsContext?: FsContext;
  /** Compute and report what would be written, but write nothing (dogfood-3 F13). */
  dryRun?: boolean;
};

function checkLabel(label: string): void {
  if (label === '' || label.length > 200 || UNSAFE_LINE_CHARS.test(label) || label.includes('\\') || label.startsWith('/') || label.startsWith('~') || /^[A-Za-z]:/.test(label)) {
    fail('E_USAGE', `--label ${JSON.stringify(label)} must be a relative origin label, not a local path`);
  }
}

function checkUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail('E_USAGE', `--url ${JSON.stringify(url)} is not a URL`);
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('E_USAGE', '--url must be an http(s) URL without credentials');
}

export function captureFile(req: CaptureFileRequest): CaptureResult {
  checkTitle(req.title);
  let st;
  try {
    st = lstatSync(req.from);
  } catch {
    fail('E_SOURCE_UNAVAILABLE', `cannot read ${req.from}`);
  }
  if (st.isSymbolicLink() || !st.isFile()) fail('E_PATH_ESCAPE', `${req.from} must be a regular file, not a symbolic link`);
  if (st.size > MAX_CAPTURE_BYTES) fail('E_LIMIT', `${req.from} is ${st.size} bytes; the capture limit is ${MAX_CAPTURE_BYTES}`);
  const bytes = new Uint8Array(readFileSync(req.from));
  const label = req.label ?? basename(req.from);
  checkLabel(label);
  if (req.url !== undefined) checkUrl(req.url);
  if (req.kind === 'web' && req.url === undefined) fail('E_USAGE', '--kind web needs --url');
  const capturedAt = req.kind === 'example' && req.capturedAt === undefined ? undefined : capturedAtValue(req.capturedAt);

  const raster = rasterExtension(bytes);
  const common = {
    id: req.id, kind: req.kind, title: req.title,
    ...(req.kind === 'file' ? { file: label } : {}),
    ...(req.url !== undefined ? { url: req.url } : {}),
    ...(capturedAt !== undefined ? { capturedAt } : {}),
  } as const;
  if (raster) {
    if (req.lines !== undefined) fail('E_USAGE', '--lines does not apply to an image');
    const path = `assets/${req.id}.${raster}`;
    const attrs: SourceAttributes = { ...common, asset: path, excerptSha256: sha256Hex(bytes) };
    const warning = duplicateSourceWarning(req.doc, attrs);
    const warnings = warning ? [warning] : [];
    if (req.dryRun) {
      const bundle = loadBundle(req.doc);
      return {
        docId: bundle.docId ?? '', id: attrs.id, replaced: false,
        oldRevision: bundle.sourceRevision ?? '', newRevision: bundle.sourceRevision ?? '',
        attributes: attrs, warnings, dryRun: true, excerptPreview: [],
      };
    }
    const result = writeSource({ indexPath: req.doc, attrs, body: { asset: { path, bytes } }, recapture: req.recapture === true, ...(req.fsContext ? { fsContext: req.fsContext } : {}) });
    return { ...result, attributes: attrs, warnings };
  }
  const excerpt = req.lines !== undefined ? (() => { const r = parseLineRange(req.lines!); return extractExcerpt(bytes, r.start, r.end); })() : wholeExcerpt(bytes);
  const language = languageFor(label, req.language);
  const attrs: SourceAttributes = {
    ...common,
    ...(language ? { language } : {}),
    ...(req.lines !== undefined ? { start: excerpt.start, end: excerpt.end } : {}),
    excerptSha256: excerpt.excerptSha256,
    ...(req.kind === 'file' ? { originFileSha256: sha256Hex(bytes) } : {}),
  };
  const warning = duplicateSourceWarning(req.doc, attrs);
  const warnings = warning ? [warning] : [];
  if (req.dryRun) {
    const bundle = loadBundle(req.doc);
    return {
      docId: bundle.docId ?? '', id: attrs.id, replaced: false,
      oldRevision: bundle.sourceRevision ?? '', newRevision: bundle.sourceRevision ?? '',
      attributes: attrs, warnings, dryRun: true, excerptPreview: excerptPreview(excerpt.text),
    };
  }
  const result = writeSource({ indexPath: req.doc, attrs, body: { text: excerpt.text }, recapture: req.recapture === true, ...(req.fsContext ? { fsContext: req.fsContext } : {}) });
  return { ...result, attributes: attrs, warnings };
}
