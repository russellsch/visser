import type { Diagnostic } from '../../core/src/types.ts';
import { type SchemaName, validateAgainst } from '../../core/src/model/schemas.ts';

// Exit codes (§15.6).
export const EXIT = {
  ok: 0,
  internal: 1,
  invalid: 2,
  unavailable: 3,
  security: 4,
  conflict: 5,
} as const;

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  constructor(code: string, message: string, exitCode: number) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export type ParsedArgs = {
  positional: string[];
  flags: Map<string, string | true>;
  /** Every value of each flag, in order, for repeatable flags such as `--retire`. */
  all: Map<string, Array<string | true>>;
};

// Parse `--name value`, `--name=value`, and boolean `--name` flags.
// `booleans` lists flags that never take a value.
const BOOLEAN_FLAGS = new Set(['json', 'check', 'help', 'release', 'default', 'review']);

export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  const all = new Map<string, Array<string | true>>();
  const set = (name: string, value: string | true) => {
    flags.set(name, value);
    all.set(name, [...(all.get(name) ?? []), value]);
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const name = arg.slice(2);
    const next = args[i + 1];
    if (BOOLEAN_FLAGS.has(name) || next === undefined || next.startsWith('--')) {
      set(name, true);
    } else {
      set(name, next);
      i++;
    }
  }
  return { positional, flags, all };
}

/** A single-valued flag. A repeat is refused: the last-wins rule would let a stray guard flag override the intended one. */
export function stringFlag(args: ParsedArgs, name: string): string | undefined {
  if ((args.all.get(name)?.length ?? 0) > 1) throw new CliError('E_USAGE', `--${name} may appear only once`, EXIT.invalid);
  const value = args.flags.get(name);
  if (value === true) throw new CliError('E_USAGE', `--${name} needs a value`, EXIT.invalid);
  return value;
}

export function printDiagnostics(diagnostics: Diagnostic[], json: boolean): void {
  if (json) {
    printJson('diagnostics', { schema: 'visser-diagnostics/1', diagnostics });
    return;
  }
  for (const d of diagnostics) {
    const where = [d.path, d.startLine].filter((x) => x !== undefined).join(':');
    const target = d.targetId ? ` [${d.targetId}]` : '';
    process.stderr.write(`${d.severity} ${d.code}${where ? ` ${where}` : ''}${target}: ${d.message}\n`);
    if (d.suggestedAction) process.stderr.write(`  -> ${d.suggestedAction}\n`);
  }
}

// Exit code for a set of diagnostics: the most severe class wins.
export function exitCodeFor(diagnostics: Diagnostic[]): number {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length === 0) return EXIT.ok;
  const security = ['E_PATH_ESCAPE', 'E_UNSAFE_CONTENT', 'E_EXTENSION_UNTRUSTED', 'E_TOOLKIT_UNTRUSTED', 'E_INTEGRITY'];
  if (errors.some((d) => security.includes(d.code))) return EXIT.security;
  if (errors.some((d) => ['E_REF_STALE', 'E_WRITE_CONFLICT'].includes(d.code))) return EXIT.conflict;
  if (errors.some((d) => ['E_TOOLKIT_MISSING', 'E_EXTENSION_MISSING', 'E_SOURCE_UNAVAILABLE', 'E_UNSUPPORTED'].includes(d.code))) return EXIT.unavailable;
  return EXIT.invalid;
}

/**
 * Print a --json result after validating it against its normative schema
 * (§5.4). An output that violates its own schema is a toolkit bug, so this
 * throws an internal error instead of printing unchecked JSON.
 */
export function printJson(name: SchemaName, value: unknown): void {
  const result = validateAgainst(name, value);
  if (!result.ok) throw new Error(`--json output violates schema ${name}: ${result.errors.join('; ')}`);
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

/**
 * A reader that closes the pipe early (`visser skill show | head -1`) makes
 * later writes fail with EPIPE. Ignore the rest of the output on that stream,
 * and let the command finish: a write command must not stop half-way, and the
 * exit code stays the command's own.
 */
export function ignoreClosedPipes(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') throw error;
      stream.write = (() => true) as typeof stream.write;
    });
  }
}
