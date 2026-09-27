// A small, strict gzip'd ustar reader and a reproducible writer (§12.1).
// The reader rejects the whole archive (E_INTEGRITY) on any entry it does not
// fully accept; it never sanitizes, skips, or renames an entry. The Phase 4
// review showed a general tar library doing all of these and reporting success.
import { createHash } from 'node:crypto';
import { closeSync, constants, createReadStream, mkdirSync, openSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, gzipSync } from 'node:zlib';
import { HashError, validateBundlePath } from '../model/hash.ts';

const MIB = 1024 * 1024;

export type ArchiveLimits = {
  /** Compressed archive size (§12.1: 64 MiB). */
  maxArchiveBytes: number;
  /** Sum of declared entry sizes (§12.1: 256 MiB). */
  maxDeclaredBytes: number;
  /** Decompressed tar stream bytes, counted while streaming (§12.1: 256 MiB). */
  maxDecompressedBytes: number;
};

export const DEFAULT_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 64 * MIB,
  maxDeclaredBytes: 256 * MIB,
  maxDecompressedBytes: 256 * MIB,
};

/** A PAX or GNU long-name record never needs more than this. */
const MAX_META_BYTES = 64 * 1024;

function fail(message: string): never {
  throw new HashError('E_INTEGRITY', 'E_INTEGRITY', `archive rejected: ${message}`);
}

// ---------------------------------------------------------------------------
// Header fields

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function cString(block: Uint8Array, start: number, length: number): Uint8Array {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return end === -1 ? field : field.subarray(0, end);
}

function text(bytes: Uint8Array, what: string): string {
  try {
    return utf8.decode(bytes);
  } catch {
    fail(`${what} is not valid UTF-8`);
  }
}

function octal(block: Uint8Array, start: number, length: number, what: string): number {
  const field = block.subarray(start, start + length);
  if ((field[0]! & 0x80) !== 0) fail(`${what} uses base-256 encoding`);
  const raw = String.fromCharCode(...field).replace(/[\0 ]+$/, '').replace(/^ +/, '');
  if (raw === '') return 0;
  if (!/^[0-7]+$/.test(raw)) fail(`${what} is not an octal number`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value)) fail(`${what} is too large`);
  return value;
}

function checksumOk(block: Uint8Array): boolean {
  const stored = octal(block, 148, 8, 'header checksum');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : block[i]!;
  return sum === stored;
}

function isZero(bytes: Uint8Array): boolean {
  for (const b of bytes) if (b !== 0) return false;
  return true;
}

/** PAX records: "LEN key=value\n", each length counting the whole record. */
function parsePax(data: Uint8Array): Map<string, string> {
  const records = new Map<string, string>();
  let pos = 0;
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos);
    if (space === -1) fail('malformed PAX record');
    const lenText = String.fromCharCode(...data.subarray(pos, space));
    if (!/^[1-9][0-9]*$/.test(lenText)) fail('malformed PAX record length');
    const len = Number(lenText);
    const end = pos + len;
    if (end > data.length || data[end - 1] !== 0x0a) fail('malformed PAX record');
    const record = text(data.subarray(space + 1, end - 1), 'a PAX record');
    const eq = record.indexOf('=');
    if (eq <= 0) fail('malformed PAX record');
    const key = record.slice(0, eq);
    if (records.has(key)) fail(`PAX key ${key} appears twice`);
    records.set(key, record.slice(eq + 1));
    pos = end;
  }
  return records;
}

// ---------------------------------------------------------------------------
// Reader

export type ExtractResult = { files: string[]; directories: string[] };

type Pending = { kind: 'pax' | 'gnu-name'; size: number; data: Uint8Array[]; got: number };

class Parser {
  private buffer: Uint8Array = new Uint8Array(0);
  private declared = 0;
  private ended = false;
  private pax: Map<string, string> | undefined;
  private longName: string | undefined;
  private meta: Pending | undefined;
  private file: { path: string; fd: number; remaining: number; padding: number } | undefined;
  private skipPadding = 0;
  /** Exact names already seen, and folded name -> first spelling. */
  private readonly names = new Map<string, 'file' | 'dir'>();
  private readonly folded = new Map<string, string>();
  readonly files: string[] = [];
  readonly directories: string[] = [];

  private readonly explicit = new Set<string>();
  private readonly dest: string;
  private readonly limits: ArchiveLimits;

  constructor(dest: string, limits: ArchiveLimits) {
    this.dest = dest;
    this.limits = limits;
  }

  push(chunk: Uint8Array): void {
    let data = this.buffer.length > 0 ? concat(this.buffer, chunk) : chunk;
    while (data.length > 0) {
      if (this.ended) {
        // After the end-of-archive marker only zero padding may follow.
        if (!isZero(data)) fail('data after the end-of-archive marker');
        data = new Uint8Array(0);
        break;
      }
      if (this.file) {
        const take = Math.min(this.file.remaining, data.length);
        if (take > 0) writeSync(this.file.fd, data, 0, take);
        this.file.remaining -= take;
        data = data.subarray(take);
        if (this.file.remaining === 0) {
          closeSync(this.file.fd);
          this.skipPadding = this.file.padding;
          this.file = undefined;
        }
        continue;
      }
      if (this.meta) {
        const take = Math.min(this.meta.size - this.meta.got, data.length);
        this.meta.data.push(data.subarray(0, take).slice());
        this.meta.got += take;
        data = data.subarray(take);
        if (this.meta.got === this.meta.size) {
          this.finishMeta(this.meta);
          this.skipPadding = pad(this.meta.size);
          this.meta = undefined;
        }
        continue;
      }
      if (this.skipPadding > 0) {
        const take = Math.min(this.skipPadding, data.length);
        this.skipPadding -= take;
        data = data.subarray(take);
        continue;
      }
      if (data.length < 512) break;
      this.header(data.subarray(0, 512));
      data = data.subarray(512);
    }
    this.buffer = data.length > 0 ? data.slice() : new Uint8Array(0);
  }

  finish(): ExtractResult {
    if (this.file) {
      closeSync(this.file.fd);
      this.file = undefined;
      fail('the archive ends inside a file');
    }
    if (!this.ended) fail('the archive has no end-of-archive marker (truncated?)');
    return { files: this.files, directories: this.directories };
  }

  abort(): void {
    if (this.file) {
      try { closeSync(this.file.fd); } catch { /* already closed */ }
      this.file = undefined;
    }
  }

  private finishMeta(meta: Pending): void {
    const bytes = concat(...meta.data);
    if (meta.kind === 'gnu-name') {
      this.longName = text(cString(bytes, 0, bytes.length), 'a GNU long name');
      return;
    }
    const records = parsePax(bytes);
    for (const key of records.keys()) {
      if (key.startsWith('GNU.sparse')) fail('sparse file entries are not accepted');
    }
    this.pax = records;
  }

  private header(block: Uint8Array): void {
    if (isZero(block)) {
      if (this.pax || this.longName !== undefined) fail('an extended header has no entry');
      this.ended = true;
      return;
    }
    if (!checksumOk(block)) fail('header checksum mismatch');
    const magic = String.fromCharCode(...block.subarray(257, 263));
    const version = String.fromCharCode(...block.subarray(263, 265));
    const posix = magic === 'ustar\0' && version === '00';
    const gnu = magic === 'ustar ' && version === ' \0';
    if (!posix && !gnu) fail('not a ustar header');
    const type = String.fromCharCode(block[156]!);
    let size = octal(block, 124, 12, 'entry size');

    if (type === 'x' || type === 'L') {
      if (this.meta || (type === 'x' && this.pax) || (type === 'L' && this.longName !== undefined)) fail('repeated extended header');
      if (size > MAX_META_BYTES) fail('extended header is too large');
      this.meta = { kind: type === 'x' ? 'pax' : 'gnu-name', size, data: [], got: 0 };
      if (size === 0) {
        this.finishMeta(this.meta);
        this.meta = undefined;
      }
      return;
    }

    let name = text(cString(block, 0, 100), 'an entry name');
    const prefix = posix ? text(cString(block, 345, 155), 'an entry prefix') : '';
    if (prefix !== '') name = `${prefix}/${name}`;
    if (this.longName !== undefined) name = this.longName;
    const pax = this.pax;
    if (pax?.has('path')) name = pax.get('path')!;
    if (pax?.has('size')) {
      const v = pax.get('size')!;
      if (!/^[0-9]+$/.test(v) || !Number.isSafeInteger(Number(v))) fail('malformed PAX size');
      size = Number(v);
    }
    this.pax = undefined;
    this.longName = undefined;

    const isFile = type === '0' || type === '\0';
    const isDir = type === '5';
    if (!isFile && !isDir) fail(`entry ${JSON.stringify(name)} has type ${JSON.stringify(type)}; only regular files and directories are accepted`);
    if (isDir) {
      if (size !== 0) fail(`directory ${JSON.stringify(name)} has a size`);
      if (name.endsWith('/')) name = name.slice(0, -1);
    }
    if (name.startsWith('/')) fail(`entry ${JSON.stringify(name)} has an absolute path`);
    try {
      validateBundlePath(name);
    } catch (error) {
      fail(`entry ${JSON.stringify(name)}: ${(error as Error).message}`);
    }
    this.claim(name, isDir ? 'dir' : 'file');

    this.declared += size;
    if (this.declared > this.limits.maxDeclaredBytes) fail(`declared entry sizes exceed ${this.limits.maxDeclaredBytes} bytes`);

    const target = join(this.dest, ...name.split('/'));
    const parent = name.split('/').slice(0, -1);
    if (parent.length > 0) mkdirSync(join(this.dest, ...parent), { recursive: true });
    if (isDir) {
      mkdirSync(target, { recursive: true });
      this.directories.push(name);
      return;
    }
    const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644);
    this.files.push(name);
    if (size === 0) {
      closeSync(fd);
      return;
    }
    this.file = { path: name, fd, remaining: size, padding: pad(size) };
  }

  /** Reject duplicates, file/directory conflicts, and case-folded NFC collisions, including implicit parents. */
  private claim(name: string, kind: 'file' | 'dir'): void {
    if (this.explicit.has(name)) fail(`duplicate entry ${JSON.stringify(name)}`);
    this.explicit.add(name);
    const segments = name.split('/');
    for (let i = 1; i <= segments.length; i++) {
      const path = segments.slice(0, i).join('/');
      const role = i === segments.length ? kind : 'dir';
      const fold = path.normalize('NFC').toLowerCase().normalize('NFC');
      const first = this.folded.get(fold);
      if (first !== undefined && first !== path) fail(`entries ${JSON.stringify(first)} and ${JSON.stringify(path)} collide when case is folded`);
      const seen = this.names.get(path);
      if (seen !== undefined && seen !== role) fail(`${JSON.stringify(path)} is both a file and a directory`);
      this.names.set(path, role);
      this.folded.set(fold, path);
    }
  }
}

function pad(size: number): number {
  return (512 - (size % 512)) % 512;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/**
 * Extract a gzip'd ustar archive into `dest`, an existing empty directory.
 * On any rejection this throws E_INTEGRITY; the caller removes `dest`, since
 * entries before the bad one may already be written there.
 */
export async function extractArchive(archive: string, dest: string, limits: ArchiveLimits = DEFAULT_LIMITS): Promise<ExtractResult & { archiveSha256: string }> {
  const stat = statSync(archive);
  if (!stat.isFile()) fail(`${archive} is not a regular file`);
  if (stat.size > limits.maxArchiveBytes) fail(`the archive is larger than ${limits.maxArchiveBytes} bytes`);
  const parser = new Parser(dest, limits);
  const hash = createHash('sha256');
  let compressed = 0;
  let decompressed = 0;
  const countCompressed = new Transform({
    transform(chunk: Buffer, _enc, done) {
      compressed += chunk.length;
      if (compressed > limits.maxArchiveBytes) return done(new HashError('E_INTEGRITY', 'E_INTEGRITY', `archive rejected: the archive is larger than ${limits.maxArchiveBytes} bytes`));
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(createReadStream(archive), countCompressed, createGunzip(), async (source: AsyncIterable<Buffer>) => {
      for await (const chunk of source) {
        decompressed += chunk.length;
        if (decompressed > limits.maxDecompressedBytes) fail(`the archive decompresses to more than ${limits.maxDecompressedBytes} bytes`);
        parser.push(chunk);
      }
    });
  } catch (error) {
    parser.abort();
    if (error instanceof HashError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'Z_DATA_ERROR' || code === 'Z_BUF_ERROR' || code === 'ERR_INVALID_ARG_TYPE') fail(`the archive is not valid gzip (${(error as Error).message})`);
    if (code === 'EEXIST') fail('an entry was written twice');
    throw error;
  }
  const result = parser.finish();
  return { ...result, archiveSha256: hash.digest('hex') };
}

// ---------------------------------------------------------------------------
// Writer (reproducible: sorted entries, fixed metadata, fixed gzip header)

export type TarEntry = {
  name: string;
  /** '0' file, '5' directory, or any raw type flag (tests build hostile archives). */
  type?: string;
  data?: Uint8Array;
  mode?: number;
  linkname?: string;
  /** Override the size field (tests declare sizes that are not present). */
  declaredSize?: number;
  /** Use the ustar prefix field instead of PAX for a long name. */
  prefix?: string;
  /** Write the GNU magic instead of POSIX ustar. */
  gnu?: boolean;
};

function writeString(block: Uint8Array, start: number, length: number, value: string): void {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > length) throw new Error(`tar field too long: ${value}`);
  block.set(bytes, start);
}

function writeOctal(block: Uint8Array, start: number, length: number, value: number): void {
  writeString(block, start, length, value.toString(8).padStart(length - 1, '0') + '\0');
}

/** One raw 512-byte header block with a correct checksum. */
export function tarHeader(entry: TarEntry): Uint8Array {
  const block = new Uint8Array(512);
  writeString(block, 0, 100, entry.name);
  writeOctal(block, 100, 8, entry.mode ?? ((entry.type ?? '0') === '5' ? 0o755 : 0o644));
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, entry.declaredSize ?? entry.data?.length ?? 0);
  writeOctal(block, 136, 12, 0);
  block[156] = (entry.type ?? '0').charCodeAt(0);
  if (entry.linkname) writeString(block, 157, 100, entry.linkname);
  if (entry.gnu) writeString(block, 257, 8, 'ustar  \0');
  else {
    writeString(block, 257, 6, 'ustar\0');
    writeString(block, 263, 2, '00');
  }
  if (entry.prefix) writeString(block, 345, 155, entry.prefix);
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of block) sum += b;
  writeString(block, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
  return block;
}

/** A PAX record set as one data payload. */
export function paxData(records: Record<string, string>): Uint8Array {
  let out = '';
  for (const [key, value] of Object.entries(records)) {
    const body = ` ${key}=${value}\n`;
    const bodyLen = new TextEncoder().encode(body).length;
    let len = bodyLen + 1;
    while (String(len).length + bodyLen !== len) len = String(len).length + bodyLen;
    out += `${len}${body}`;
  }
  return new TextEncoder().encode(out);
}

/** Raw tar bytes for the entries, in the order given, with the end marker. */
export function tarBytes(entries: TarEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    parts.push(tarHeader(entry));
    const data = entry.data ?? new Uint8Array(0);
    if (data.length > 0) {
      parts.push(data);
      parts.push(new Uint8Array(pad(data.length)));
    }
  }
  parts.push(new Uint8Array(1024));
  return concat(...parts);
}

/** gzip with a fixed header: mtime 0, no name, OS byte 3 (Unix). */
export function gzipFixed(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(gzipSync(data, { level: 9 }));
  out[9] = 3;
  return out;
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * A reproducible tar.gz of regular files: sorted by UTF-8 bytes, uid/gid 0,
 * empty owner names, mtime 0, mode 0755 under bin/ and 0644 elsewhere.
 * Names longer than 100 bytes use a PAX `path` record.
 */
export function packFiles(files: Array<{ path: string; data: Uint8Array }>): Uint8Array {
  const entries: TarEntry[] = [];
  const sorted = [...files].sort((a, b) => compareBytes(a.path, b.path));
  for (const file of sorted) {
    validateBundlePath(file.path);
    const mode = file.path.startsWith('bin/') ? 0o755 : 0o644;
    const bytes = new TextEncoder().encode(file.path);
    if (bytes.length > 100) {
      const pax = paxData({ path: file.path });
      entries.push({ name: `PaxHeaders/${createHash('sha256').update(file.path).digest('hex').slice(0, 32)}`, type: 'x', data: pax, mode: 0o644 });
      entries.push({ name: createHash('sha256').update(file.path).digest('hex').slice(0, 64), data: file.data, mode });
    } else {
      entries.push({ name: file.path, data: file.data, mode });
    }
  }
  return gzipFixed(tarBytes(entries));
}
