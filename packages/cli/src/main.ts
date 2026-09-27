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
import { CliError, EXIT, parseArgs, printDiagnostics } from './cli-util.ts';

const DEFERRED = new Map<string, string>([
  ['vendor', 'after v1'], ['content', 'after v1'],
]);

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
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
      case '--help':
      case '-h':
        process.stdout.write('usage: visser <init|ids assign|check|build|serve|export|refs|capture|fork|install|trust toolkit|doctor|skill show|upgrade|catalogue list|catalogue show|extension> ...\n');
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

