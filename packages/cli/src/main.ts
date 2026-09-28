// Visser CLI entry (§17.1). Phase 0 implements init, ids assign, check, and
// export --format markdown. Every other public command exits 3 with E_UNSUPPORTED.
import type { Diagnostic } from '../../core/src/types.ts';
import { runInit } from './commands/init.ts';
import { runIdsAssign } from './commands/ids-assign.ts';
import { runCheck } from './commands/check.ts';
import { runExport } from './commands/export.ts';
import { runBuild } from './commands/build.ts';
import { runServe } from './commands/serve.ts';
import { runRefs } from './commands/refs.ts';
import { runCapture } from './commands/capture.ts';
import { runFork } from './commands/fork.ts';
import { runInstall } from './commands/install.ts';
import { runTrust } from './commands/trust.ts';
import { runDoctor } from './commands/doctor.ts';
import { runSkill } from './commands/skill.ts';
import { runUpgrade } from './commands/upgrade.ts';
import { runCatalogue } from './commands/catalogue.ts';
import { runExtension } from './commands/extension.ts';
import { CliError, EXIT, exitCodeFor, parseArgs, printDiagnostics } from './cli-util.ts';
import { HashError } from '../../core/src/model/hash.ts';
import { bundledReleaseDir, verifyRelease } from './toolkit.ts';

const DEFERRED = new Map<string, string>([
  ['vendor', 'after v1'], ['content', 'after v1'],
]);

// One line of usage for each command, for `visser help`, `visser --help`, and
// `visser COMMAND --help`. Each command also prints its full usage on E_USAGE.
const COMMANDS: Array<[string, string]> = [
  ['init', 'visser init PATH --kind KIND --title TITLE [--toolkit-dir DIR]'],
  ['ids', 'visser ids assign DOC [--check]'],
  ['check', 'visser check DOC [--review] [--verify-origins [--repo-map LABEL=PATH]] [--release] [--json]'],
  ['build', 'visser build DOC [--out DIR] [--allow-layout-fallback] [--allow-extension-fallback] [--toolkit-dir DIR | --dev-toolkit DIR]'],
  ['serve', 'visser serve DOC [--port N] [--host H] [--public-origin URL] [--base-path P] [--cache-private]'],
  ['export', 'visser export DOC|--collection FILE --format site|markdown --out DIR [--audience private|public] [--allow-private-content] [--include-source] [--json]'],
  ['refs', 'visser refs show DOC TARGET_ID | resolve --packet FILE | refresh --packet FILE | replace --packet FILE --replacement FILE --expected-revision REV | retire ...'],
  ['capture', 'visser capture git --repo DIR --file PATH --lines START:END --doc DOC --id ID --title TITLE | capture file --from PATH --kind KIND --doc DOC --id ID --title TITLE'],
  ['fork', 'visser fork DOC DEST [--root DIR] [--json]'],
  ['install', 'visser install --from-dir DIR | --archive FILE [--sha256 DIGEST] | --from-release OWNER/REPO --version V --sha256 DIGEST --scope user|repo [--default] [--root DIR] [--json]'],
  ['trust', 'visser trust toolkit DIGEST [--revoke] [--json]'],
  ['doctor', 'visser doctor [--doc DOC] [--json]'],
  ['skill', 'visser skill show [--doc PATH] [--toolkit-dir DIR] [--json]'],
  ['upgrade', 'visser upgrade DOC --to DIGEST [--allow-downgrade] [--dry-run] [--json]'],
  ['catalogue', 'visser catalogue list | show NAME [--part guide|template|schema] [--json]'],
  ['extension', 'visser extension install --from-dir DIR --scope user|repo | inspect DIR|DIGEST | trust DIGEST [--revoke] | pin DOC DIGEST'],
];
const USAGE_BY_COMMAND = new Map(COMMANDS);

function helpText(command?: string): string {
  const one = command !== undefined ? USAGE_BY_COMMAND.get(command) : undefined;
  if (one) return `usage: ${one}\n`;
  return ['usage: visser COMMAND [ARGS]', '', ...COMMANDS.map(([, usage]) => `  ${usage}`), '', 'visser help COMMAND, or visser COMMAND --help, prints one command. visser --version prints the toolkit.', ''].join('\n');
}

function versionText(): string {
  const dir = bundledReleaseDir();
  if (!dir) return 'visser (source, not a release: no version)\n';
  const release = verifyRelease(dir);
  return `visser ${release.version}\n  toolkit: ${release.sha256}\n  release: ${release.dir}\n`;
}

/** File system errors that the user can fix: a diagnostic, not a stack trace (install-pressure-1, m2). */
const USER_FS_ERRORS = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'EDQUOT']);

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === '--version' || command === 'version') {
      process.stdout.write(versionText());
      return EXIT.ok;
    }
    if (command === 'help' || command === '--help' || command === '-h') {
      process.stdout.write(helpText(rest[0]));
      return EXIT.ok;
    }
    if (command !== undefined && USAGE_BY_COMMAND.has(command) && (rest.includes('--help') || rest.includes('-h'))) {
      process.stdout.write(helpText(command));
      return EXIT.ok;
    }
    switch (command) {
      case 'init':
        return await runInit(parseArgs(rest));
      case 'ids':
        if (rest[0] !== 'assign') throw new CliError('E_USAGE', 'usage: visser ids assign DOC [--check]', EXIT.invalid);
        return await runIdsAssign(parseArgs(rest.slice(1)));
      case 'check':
        return await runCheck(parseArgs(rest));
      case 'export':
        return await runExport(parseArgs(rest));
      case 'build':
        return await runBuild(parseArgs(rest));
      case 'serve':
        return await runServe(parseArgs(rest));
      case 'refs':
        return await runRefs(parseArgs(rest));
      case 'capture':
        return await runCapture(parseArgs(rest));
      case 'fork':
        return await runFork(parseArgs(rest));
      case 'install':
        return await runInstall(parseArgs(rest));
      case 'trust':
        return await runTrust(parseArgs(rest));
      case 'doctor':
        return await runDoctor(parseArgs(rest));
      case 'skill':
        return await runSkill(parseArgs(rest));
      case 'upgrade':
        return await runUpgrade(parseArgs(rest));
      case 'catalogue':
        return await runCatalogue(parseArgs(rest));
      case 'extension':
        return await runExtension(parseArgs(rest));
      case undefined:
        process.stdout.write(helpText());
        return EXIT.invalid;
      default: {
        const phase = DEFERRED.get(command);
        const diagnostic: Diagnostic = phase
          ? { code: 'E_UNSUPPORTED', severity: 'error', message: `\`${command}\` is not implemented yet (planned for ${phase}).` }
          : { code: 'E_USAGE', severity: 'error', message: `unknown command \`${command}\`` };
        printDiagnostics([diagnostic], rest.includes('--json'));
        return phase ? EXIT.unavailable : EXIT.invalid;
      }
    }
  } catch (error) {
    if (error instanceof CliError) {
      printDiagnostics([{ code: error.code, severity: 'error', message: error.message }], rest.includes('--json'));
      return error.exitCode;
    }
    // A HashError that no command caught (for example E_USAGE from VISSER_HOME).
    if (error instanceof HashError) {
      const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
      printDiagnostics([diagnostic], rest.includes('--json'));
      return exitCodeFor([diagnostic]);
    }
    const errno = error as NodeJS.ErrnoException;
    if (errno.code && USER_FS_ERRORS.has(errno.code)) {
      const where = errno.path ? ` ${errno.path}` : '';
      const why = errno.code === 'ENOSPC' || errno.code === 'EDQUOT' ? 'no space left' : errno.code === 'EROFS' ? 'read-only file system' : 'permission denied';
      printDiagnostics([{ code: 'E_SOURCE_UNAVAILABLE', severity: 'error', message: `cannot write${where}: ${why} (${errno.code}); check the folder, or set VISSER_HOME to a writable absolute path` }], rest.includes('--json'));
      return EXIT.unavailable;
    }
    process.stderr.write(`internal error: ${(error as Error).stack ?? String(error)}\n`);
    return EXIT.internal;
  }
}

