// Child process for the trust-store race test: adds or revokes digests.
import { createHash } from 'node:crypto';
import { addTrust, revokeTrust } from '../../packages/core/src/distribution/trust.ts';

const [mode, home, n] = process.argv.slice(2);
const env = { EXPLAIN_HOME: home };
if (mode === 'add') {
  for (let i = 0; i < Number(n); i++) addTrust(createHash('sha256').update(`${process.pid}-${i}`).digest('hex'), 'race', env);
} else if (mode === 'revoke') {
  for (let i = 0; i < Number(n); i++) revokeTrust('f'.repeat(64), env);
}
