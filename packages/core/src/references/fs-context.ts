// Explicit side-effect context for guarded writes (§17.9). Tests use the hooks
// to inject external changes deterministically (§18.8, T20).
import { randomBytes } from 'node:crypto';

export type FsContext = {
  /** Called after the candidate is written and before the final raw-hash recheck. */
  beforeRename?: (indexPath: string) => void;
  /** fork only: called after the exclusive mkdir claims DEST and before the rename. */
  afterClaim?: (dest: string) => void;
  /** Wall clock for lock metadata only; never enters a build. */
  now?: () => Date;
  /** Random token source for lock and temporary file names. */
  randomToken?: () => string;
};

export function lockToken(ctx: FsContext | undefined): string {
  return ctx?.randomToken ? ctx.randomToken() : randomBytes(16).toString('hex');
}

export function lockTime(ctx: FsContext | undefined): string {
  return (ctx?.now ? ctx.now() : new Date()).toISOString();
}
