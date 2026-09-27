// Explain CLI entry (§17.1). Phase 0 implements init, ids assign, check, and
// export --format markdown. Every other public command exits 3 with E_UNSUPPORTED.
import type { Diagnostic } from '../../core/src/types.ts';
import { runInit } from './commands/init.ts';
import { runIdsAssign } from './commands/ids-assign.ts';
import { runCheck } from './commands/check.ts';
import { runExport } from './commands/export.ts';
import { runBuild } from './commands/build.ts';
import { runServe } from './commands/serve.ts';
import { runRefs } from './commands/refs.ts';
import { CliError, EXIT, parseArgs, printDiagnostics } from './cli-util.ts';

const DEFERRED = new Map<string, string>([
  ['capture', 'Phase 3'],
  ['fork', 'Phase 3'], ['catalogue', 'Phase 4'], ['skill', 'Phase 4'], ['install', 'Phase 4'],
  ['upgrade', 'Phase 4'], ['vendor', 'Phase 4'], ['content', 'Phase 3'], ['extension', 'Phase 5'],
  ['doctor', 'Phase 4'],
]);

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'init':
        return await runInit(parseArgs(rest));
      case 'ids':
        if (rest[0] !== 'assign') throw new CliError('E_USAGE', 'usage: explain ids assign DOC [--check]', EXIT.invalid);
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
      case undefined:
      case '--help':
      case '-h':
        process.stdout.write('usage: explain <init|ids assign|check|build|serve|export|refs> ...\n');
        return command === undefined ? EXIT.invalid : EXIT.ok;
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
    process.stderr.write(`internal error: ${(error as Error).stack ?? String(error)}\n`);
    return EXIT.internal;
  }
}

