// `visser install --from-dir DIR | --archive FILE [--sha256 DIGEST] |
// --from-release OWNER/REPO --version V --sha256 DIGEST --scope user|repo
// [--default] [--root DIR] [--json]` (§12.1, §12.2, §12.5, §12.6, §17.1).
// Verifies and activates an exact release, and records its digest in the user
// trust store. Exit: integrity and download-policy failures are 4, a missing
// source, release, or network is 3, a race is 5.
//
// Test seams (§12.5): VISSER_TEST_API_BASE replaces https://api.github.com
// (it then receives the token), and VISSER_TEST_CA_FILE adds a CA to the
// trusted roots. Both print a warning to stderr when they are set.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HashError } from '../../../core/src/model/hash.ts';
import { installFromRelease, installRelease, type InstallResult } from '../../../core/src/distribution/index.ts';
import { findRepoRoot } from '../../../core/src/references/registry.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, printJson, stringFlag } from '../cli-util.ts';

const USAGE = [
  'usage: visser install --from-dir DIR | --archive FILE [--sha256 ARCHIVE_DIGEST] --scope user|repo [--default] [--root DIR] [--json]',
  '       visser install --from-release OWNER/REPO --version VERSION --sha256 ARCHIVE_DIGEST --scope user|repo [--default] [--root DIR] [--json]',
].join('\n');

function testSeams(): { apiBase?: string; extraCa?: string[] } {
  const out: { apiBase?: string; extraCa?: string[] } = {};
  const apiBase = process.env['VISSER_TEST_API_BASE'];
  const caFile = process.env['VISSER_TEST_CA_FILE'];
  if (apiBase) {
    process.stderr.write('warning: VISSER_TEST_API_BASE is set; the release API is not api.github.com (test use only)\n');
    out.apiBase = apiBase;
  }
  if (caFile) {
    process.stderr.write('warning: VISSER_TEST_CA_FILE is set; an extra CA is trusted for this download (test use only)\n');
    try {
      out.extraCa = [readFileSync(caFile, 'utf8')];
    } catch {
      throw new CliError('E_USAGE', 'cannot read VISSER_TEST_CA_FILE', EXIT.invalid);
    }
  }
  return out;
}

export async function runInstall(args: ParsedArgs): Promise<number> {
  const json = args.flags.get('json') === true;
  if (args.positional.length > 0) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  const scope = stringFlag(args, 'scope');
  if (scope !== 'user' && scope !== 'repo') throw new CliError('E_USAGE', `--scope must be user or repo\n${USAGE}`, EXIT.invalid);
  const setDefault = args.flags.get('default');
  if (setDefault !== undefined && setDefault !== true) throw new CliError('E_USAGE', `--default takes no value\n${USAGE}`, EXIT.invalid);
  if (setDefault === true && scope !== 'user') throw new CliError('E_USAGE', `--default needs --scope user\n${USAGE}`, EXIT.invalid);
  const fromDir = stringFlag(args, 'from-dir');
  const archive = stringFlag(args, 'archive');
  const fromRelease = stringFlag(args, 'from-release');
  const version = stringFlag(args, 'version');
  const sha256 = stringFlag(args, 'sha256');
  if ([fromDir, archive, fromRelease].filter((v) => v !== undefined).length !== 1) {
    throw new CliError('E_USAGE', `pass exactly one of --from-dir, --archive, or --from-release\n${USAGE}`, EXIT.invalid);
  }
  if (fromRelease !== undefined && (version === undefined || sha256 === undefined)) {
    throw new CliError('E_USAGE', `--from-release needs --version and --sha256\n${USAGE}`, EXIT.invalid);
  }
  if (fromRelease === undefined && version !== undefined) throw new CliError('E_USAGE', `--version applies to --from-release only\n${USAGE}`, EXIT.invalid);
  const root = scope === 'repo' ? (stringFlag(args, 'root') ?? findRepoRoot(process.cwd())) : undefined;
  if (scope === 'repo' && !root) {
    throw new CliError('E_SOURCE_UNAVAILABLE', 'no repository root (a directory with .git or .visser) found; pass --root DIR', EXIT.unavailable);
  }
  try {
    const common = {
      scope: scope as 'user' | 'repo',
      ...(setDefault === true ? { setDefault: true } : {}),
      ...(root !== undefined ? { repoRoot: resolve(root) } : {}),
    };
    const result: InstallResult = fromRelease !== undefined
      ? await installFromRelease({ ...common, repository: fromRelease, version: version!, archiveSha256: sha256!, ...testSeams() })
      : await installRelease({
        ...common,
        ...(fromDir !== undefined ? { fromDir: resolve(fromDir) } : {}),
        ...(archive !== undefined ? { archive: resolve(archive) } : {}),
        ...(sha256 !== undefined ? { archiveSha256: sha256 } : {}),
      });
    if (json) {
      printJson('install', result);
    } else {
      const lines = [
        `${result.alreadyInstalled ? 'already installed' : 'installed'} toolkit ${result.version} (${result.scope} scope)`,
        `  toolkit digest: ${result.toolkitSha256}`,
        ...(result.origin.kind === 'github-release' ? [`  origin: ${result.origin.repository}@${result.origin.version} (GitHub release)`] : []),
        ...(result.archiveSha256 ? [`  archive digest: ${result.archiveSha256}`] : []),
        `  path: ${result.path}`,
        '  trusted in the user trust store',
        ...(result.shim ? [`  user shim: ${result.shim}`] : result.shimReplaced === false ? ['  user shim: kept (replaced only with --default or when there is none)'] : []),
        ...(result.default ? ['  set as the user default toolkit'] : []),
        `run: ${result.invocation}`,
        'PATH and shell startup files were not changed.',
      ];
      process.stdout.write(lines.join('\n') + '\n');
    }
    return EXIT.ok;
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([diagnostic], json);
    return exitCodeFor([diagnostic]);
  }
}
