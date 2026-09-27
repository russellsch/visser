// `explain trust toolkit DIGEST [--revoke] [--json]` (§12.4, §17.1). Writes only
// the user trust store; a repository toolchain runs only if its digest is here.
import { HashError } from '../../../core/src/model/hash.ts';
import { addTrust, readTrust, revokeTrust } from '../../../core/src/distribution/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, printJson } from '../cli-util.ts';

const USAGE = 'usage: explain trust toolkit DIGEST [--revoke] [--json]';

export async function runTrust(args: ParsedArgs): Promise<number> {
  const json = args.flags.get('json') === true;
  const [kind, digest, ...extra] = args.positional;
  if (kind !== 'toolkit' || digest === undefined || extra.length > 0) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  const revoke = args.flags.get('revoke');
  if (revoke !== undefined && revoke !== true) throw new CliError('E_USAGE', `--revoke takes no value\n${USAGE}`, EXIT.invalid);
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new CliError('E_USAGE', `a toolkit digest is 64 lowercase hex characters, not ${JSON.stringify(digest)}`, EXIT.invalid);
  try {
    const before = Object.hasOwn(readTrust().toolkits, digest);
    let result: { schema: 'explain-trust/1'; digest: string; trusted: boolean; changed: boolean; source?: string; addedAt?: string };
    if (revoke === true) {
      if (before) revokeTrust(digest);
      result = { schema: 'explain-trust/1', digest, trusted: false, changed: before };
    } else {
      const store = before ? readTrust() : addTrust(digest, 'trust toolkit');
      const entry = store.toolkits[digest]!;
      result = { schema: 'explain-trust/1', digest, trusted: true, changed: !before, source: entry.source, addedAt: entry.addedAt };
    }
    if (json) printJson('trust', result);
    else {
      const verb = result.trusted ? (result.changed ? 'trusted' : 'already trusted') : (result.changed ? 'revoked trust in' : 'was not trusted:');
      process.stdout.write(`${verb} toolkit ${digest}\n`);
    }
    return EXIT.ok;
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([diagnostic], json);
    return exitCodeFor([diagnostic]);
  }
}
