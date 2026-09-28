// The strict ustar reader and the reproducible writer (§12.1). Every hostile
// archive from the Phase 4 review must be REJECTED as a whole (E_INTEGRITY),
// not sanitized or contained: node-tar extracted most of these and reported success.
import { existsSync, mkdirSync, readdirSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { constants, gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, extractArchive, gzipFixed, packFiles, paxData, tarBytes, tarHeader, type TarEntry } from '../../packages/core/src/distribution/ustar.ts';
import { tempDir } from '../integration/install.fixtures.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const MIB = 1024 * 1024;

function writeArchive(dir: string, entries: TarEntry[]): string {
  const path = join(dir, 'a.tar.gz');
  writeFileSync(path, gzipFixed(tarBytes(entries)));
  return path;
}

async function rejects(entries: TarEntry[] | ((dir: string) => string), pattern: RegExp): Promise<void> {
  const box = tempDir('visser-ustar-');
  const archive = typeof entries === 'function' ? entries(box) : writeArchive(box, entries);
  const dest = join(box, 'dest');
  mkdirSync(dest);
  await expect(extractArchive(archive, dest)).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(pattern) });
  // Nothing escaped the destination: the box holds only the archive and dest.
  expect(readdirSync(box).sort()).toEqual(['a.tar.gz', 'dest']);
}

describe('ustar reader: hostile archives are rejected as a whole (§12.1) @R10', () => {
  const ok: TarEntry = { name: 'ok.txt', data: enc('fine') };

  it('rejects an absolute path', async () => {
    await rejects([ok, { name: '/tmp/visser-ustar-absolute.txt', data: enc('x') }], /absolute path/);
    expect(existsSync('/tmp/visser-ustar-absolute.txt')).toBe(false);
  });
  it('rejects a .. segment', async () => {
    await rejects([ok, { name: '../escape.txt', data: enc('x') }], /traversal/);
    await rejects([{ name: 'a/../../escape.txt', data: enc('x') }], /traversal/);
  });
  it('rejects empty and . segments', async () => {
    await rejects([{ name: 'a//b.txt', data: enc('x') }], /empty or dot/);
    await rejects([{ name: './b.txt', data: enc('x') }], /empty or dot/);
  });
  it('rejects a PAX path override to ../x, even when the header name is benign', async () => {
    await rejects([{ name: 'PaxHeaders/x', type: 'x', data: paxData({ path: '../x' }) }, { name: 'benign.txt', data: enc('x') }], /traversal/);
  });
  it('rejects a GNU long name that resolves to ../x', async () => {
    const name = enc('../' + 'x'.repeat(120) + '\0');
    await rejects([{ name: '././@LongLink', type: 'L', data: name, gnu: true }, { name: 'benign.txt', data: enc('x'), gnu: true }], /traversal/);
  });
  it('rejects a ustar prefix that makes an absolute path', async () => {
    await rejects([{ name: 'x.txt', prefix: '/tmp', data: enc('x') }], /absolute path/);
  });

  const types: Array<[string, string, Partial<TarEntry>]> = [
    ['hard link', '1', { linkname: 'ok.txt' }],
    ['symbolic link', '2', { linkname: '/etc/passwd' }],
    ['character device', '3', {}],
    ['block device', '4', {}],
    ['directory-then-fifo', '6', {}],
    ['contiguous file', '7', {}],
    ['global PAX header', 'g', {}],
    ['GNU sparse file', 'S', {}],
    ['GNU long link name', 'K', {}],
    ['unknown type', 'Z', {}],
  ];
  for (const [label, type, extra] of types) {
    it(`rejects a ${label} entry (type ${type})`, async () => {
      await rejects([ok, { name: `entry-${type}`, type, ...extra }], /type|extended|only regular/);
    });
  }
  it('rejects PAX sparse-file records', async () => {
    await rejects([{ name: 'PaxHeaders/s', type: 'x', data: paxData({ 'GNU.sparse.major': '1' }) }, { name: 's.bin', data: enc('x') }], /sparse/);
  });

  it('rejects a duplicate name instead of keeping one copy', async () => {
    await rejects([{ name: 'bin/visser.cjs', data: enc('a') }, { name: 'bin/visser.cjs', data: enc('b') }], /duplicate/);
  });
  it('rejects names whose case-folded NFC forms collide', async () => {
    await rejects([{ name: 'README.md', data: enc('a') }, { name: 'readme.md', data: enc('b') }], /collide/);
    await rejects([{ name: 'Bin/a.txt', data: enc('a') }, { name: 'bin/b.txt', data: enc('b') }], /collide/);
  });
  it('rejects a non-NFC name', async () => {
    await rejects([{ name: 'café.txt', data: enc('a') }], /NFC/);
  });
  it('rejects a name that is both a file and a directory', async () => {
    await rejects([{ name: 'a', data: enc('file') }, { name: 'a/b.txt', data: enc('x') }], /both a file and a directory/);
  });
  it('rejects a name that is not UTF-8', async () => {
    await rejects((dir) => {
      const header = tarHeader({ name: 'x.txt' });
      header[0] = 0xff;
      let sum = 0;
      header.fill(0x20, 148, 156);
      for (const b of header) sum += b;
      header.set(enc(sum.toString(8).padStart(6, '0') + '\0 '), 148);
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(new Uint8Array([...header, ...new Uint8Array(1024)])));
      return path;
    }, /UTF-8/);
  });

  it('rejects a declared size sum over 256 MiB before reading the data', async () => {
    await rejects((dir) => {
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(tarHeader({ name: 'huge.bin', declaredSize: 257 * MIB })));
      return path;
    }, /declared entry sizes/);
  });
  it('rejects a decompression bomb over 256 MiB whose ratio is below 1000:1, by counting while streaming', async () => {
    await rejects((dir) => {
      // A small valid archive, then zero padding past the limit. The headers
      // declare 4 bytes; only the streaming counter can catch this.
      const tar = tarBytes([{ name: 'ok.txt', data: enc('fine') }]);
      const padded = Buffer.alloc(257 * MIB);
      padded.set(tar, 0);
      // Avoid length/distance compression: its ratio for zero padding varies
      // between zlib versions and can exceed 1000 even at level 1. Huffman-only
      // compression keeps this fixture below the old ratio-based limit.
      const gz = gzipSync(padded, { level: 1, strategy: constants.Z_HUFFMAN_ONLY });
      expect(padded.length / gz.length).toBeLessThan(1000);
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gz);
      return path;
    }, /decompresses to more than/);
  }, 30_000);
  it('rejects an archive larger than 64 MiB before reading it', async () => {
    await rejects((dir) => {
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(tarBytes([ok])));
      truncateSync(path, 64 * MIB + 1);
      return path;
    }, /larger than/);
  });

  it('rejects data after the end-of-archive marker', async () => {
    await rejects((dir) => {
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(new Uint8Array([...tarBytes([ok]), ...enc('trailing')])));
      return path;
    }, /after the end-of-archive/);
  });
  it('rejects a truncated archive and a missing end marker', async () => {
    await rejects((dir) => {
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(new Uint8Array([...tarHeader({ name: 'x.txt', declaredSize: 2000 }), ...new Uint8Array(512)])));
      return path;
    }, /ends inside a file/);
    await rejects((dir) => {
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(tarBytes([ok]).subarray(0, 1024)));
      return path;
    }, /no end-of-archive marker/);
  });
  it('rejects a bad header checksum, a non-ustar header, and bytes that are not gzip', async () => {
    await rejects((dir) => {
      const tar = tarBytes([ok]);
      tar[0] = 'p'.charCodeAt(0);
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(tar));
      return path;
    }, /checksum/);
    await rejects((dir) => {
      const tar = tarBytes([ok]);
      tar.set(enc('xxxxx'), 257);
      let sum = 0;
      tar.fill(0x20, 148, 156);
      for (const b of tar.subarray(0, 512)) sum += b;
      tar.set(enc(sum.toString(8).padStart(6, '0') + '\0 '), 148);
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, gzipFixed(tar));
      return path;
    }, /not a ustar header/);
    await rejects((dir) => {
      const path = join(dir, 'a.tar.gz');
      writeFileSync(path, tarBytes([ok]));
      return path;
    }, /not valid gzip/);
  });
  it('rejects an extended header with no entry after it', async () => {
    await rejects([{ name: 'PaxHeaders/x', type: 'x', data: paxData({ path: 'a.txt' }) }], /extended header has no entry/);
  });

  it('uses the default limits from §12.1', () => {
    expect(DEFAULT_LIMITS).toEqual({ maxArchiveBytes: 64 * MIB, maxDeclaredBytes: 256 * MIB, maxDecompressedBytes: 256 * MIB });
  });
});

describe('ustar reader: accepted archives', () => {
  it('extracts files, directories, PAX long paths, GNU long names, and ustar prefixes', async () => {
    const box = tempDir('visser-ustar-');
    const long = `${'d'.repeat(60)}/${'e'.repeat(60)}/file.txt`;
    const gnuLong = `${'g'.repeat(110)}.txt`;
    const archive = writeArchive(box, [
      { name: 'dir', type: '5' },
      { name: 'dir/a.txt', data: enc('A') },
      { name: 'PaxHeaders/1', type: 'x', data: paxData({ path: long, mtime: '0' }) },
      { name: 'ignored-name', data: enc('LONG') },
      { name: '././@LongLink', type: 'L', data: enc(gnuLong + '\0'), gnu: true },
      { name: 'ignored-too', data: enc('GNU'), gnu: true },
      { name: 'b.txt', prefix: 'pre/fix', data: enc('P') },
      { name: 'empty.txt' },
    ]);
    const dest = join(box, 'dest');
    mkdirSync(dest);
    const result = await extractArchive(archive, dest);
    expect(result.files.sort()).toEqual(['dir/a.txt', 'empty.txt', gnuLong, long, 'pre/fix/b.txt'].sort());
    expect(readFileSync(join(dest, ...long.split('/')), 'utf8')).toBe('LONG');
    expect(readFileSync(join(dest, gnuLong), 'utf8')).toBe('GNU');
    expect(readFileSync(join(dest, 'pre/fix/b.txt'), 'utf8')).toBe('P');
    expect(readFileSync(join(dest, 'empty.txt'), 'utf8')).toBe('');
    expect(result.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ustar writer: reproducible archives (§12.1)', () => {
  it('writes the same bytes for the same files in any input order, with fixed metadata', async () => {
    const files = [
      { path: 'z.txt', data: enc('z') },
      { path: 'bin/visser.cjs', data: enc('cli') },
      { path: `${'n'.repeat(90)}/${'m'.repeat(40)}.txt`, data: enc('long') },
      { path: 'a.txt', data: enc('a') },
    ];
    const one = packFiles(files);
    const two = packFiles([...files].reverse());
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(true);
    // gzip header: magic, deflate, no flags (no name), mtime 0, OS 3.
    expect([...one.subarray(0, 10)]).toEqual([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 3]);
    // The strict reader reads what the writer writes.
    const box = tempDir('visser-ustar-');
    writeFileSync(join(box, 'a.tar.gz'), one);
    mkdirSync(join(box, 'dest'));
    const result = await extractArchive(join(box, 'a.tar.gz'), join(box, 'dest'));
    expect(result.files).toEqual(['a.txt', 'bin/visser.cjs', `${'n'.repeat(90)}/${'m'.repeat(40)}.txt`, 'z.txt']);
  });

  it('writes uid/gid 0, empty owner names, mtime 0, and mode 0755 only under bin/', () => {
    const header = (name: string, mode?: number) => tarHeader({ name, data: enc('x'), ...(mode !== undefined ? { mode } : {}) });
    const text = (h: Uint8Array, a: number, n: number) => String.fromCharCode(...h.subarray(a, a + n));
    const tar = tarBytes([]);
    expect(tar.length).toBe(1024);
    const packed = packFiles([{ path: 'bin/x.cjs', data: enc('x') }, { path: 'y.txt', data: enc('y') }]);
    const raw = new Uint8Array(gunzipSync(packed));
    expect(text(raw, 100, 7)).toBe('0000755');
    expect(text(raw, 108, 7)).toBe('0000000');
    expect(text(raw, 116, 7)).toBe('0000000');
    expect(text(raw, 136, 11)).toBe('00000000000');
    expect(raw[265]).toBe(0); // uname
    expect(raw[297]).toBe(0); // gname
    expect(text(raw, 1024 + 100, 7)).toBe('0000644');
    expect(text(header('q'), 257, 6)).toBe('ustar\0');
  });
});
