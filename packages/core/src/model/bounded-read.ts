// Bounded reads of repository-controlled files (visser.lock.json,
// .visser/config.json, collection files). A cloned repository controls these
// paths, so a read must not follow a symbolic link (for example to /dev/zero
// or to a private file), must refuse anything but a regular file, and must stop
// at a size cap. A parse error never echoes file content.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { HashError } from './hash.ts';

/** Cap for repository-controlled JSON files. */
export const REPO_FILE_CAP = 1024 * 1024;

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/**
 * The bytes of a regular file at `path`, or undefined if nothing is there.
 * A symbolic link, a non-regular file, or a file over `cap` bytes is E_INTEGRITY.
 */
export function readBoundedBytes(path: string, label: string = path, cap: number = REPO_FILE_CAP): Uint8Array | undefined {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (stat.isSymbolicLink()) fail('E_INTEGRITY', `${label} is a symbolic link; it must be a regular file`);
  if (!stat.isFile()) fail('E_INTEGRITY', `${label} is not a regular file`);
  let fd: number;
  try {
    // O_NOFOLLOW closes the race with a symlink swapped in after lstat;
    // O_NONBLOCK stops a FIFO swapped in from blocking the open.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') fail('E_INTEGRITY', `${label} is a symbolic link; it must be a regular file`);
    throw error;
  }
  try {
    if (!fstatSync(fd).isFile()) fail('E_INTEGRITY', `${label} is not a regular file`);
    const buffer = Buffer.alloc(cap + 1);
    let length = 0;
    for (;;) {
      const n = readSync(fd, buffer, length, buffer.length - length, null);
      if (n === 0) break;
      length += n;
      if (length > cap) fail('E_INTEGRITY', `${label} is larger than ${cap} bytes`);
    }
    return new Uint8Array(buffer.subarray(0, length));
  } finally {
    closeSync(fd);
  }
}

/** Parsed JSON of a bounded regular file, or undefined if nothing is there. Invalid JSON is E_SYNTAX, without file content. */
export function readBoundedJson(path: string, label: string = path, cap: number = REPO_FILE_CAP): unknown {
  const bytes = readBoundedBytes(path, label, cap);
  if (bytes === undefined) return undefined;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('E_SYNTAX', `${label} is not valid JSON`);
  }
}
