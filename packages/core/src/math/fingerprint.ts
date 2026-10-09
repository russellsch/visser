// Source-mode builds must use exactly the policy/font/engine of the browser pack.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __VISSER_MATH_FINGERPRINT__: string | undefined;
let cached: string | undefined;

export function mathPolicyFingerprint(): string {
  if (typeof __VISSER_MATH_FINGERPRINT__ !== 'undefined') return __VISSER_MATH_FINGERPRINT__;
  if (cached) return cached;
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
  const hash = createHash('sha256');
  const add = (path: string) => {
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) add(join(path, name));
      return;
    }
    const bytes = readFileSync(path);
    hash.update(relative(root, path).split('\\').join('/') + '\0' + bytes.length + '\0');
    hash.update(bytes);
  };
  for (const path of [
    'node_modules/@mathjax/src/mjs', 'node_modules/@mathjax/src/cjs',
    'node_modules/@mathjax/src/package.json',
    'node_modules/@mathjax/mathjax-tex-font/mjs', 'node_modules/@mathjax/mathjax-tex-font/cjs',
    'node_modules/@mathjax/mathjax-tex-font/package.json',
    'packages/core/src/math/engine.ts', 'packages/core/src/math/policy.ts', 'packages/core/src/math/svg-validate.ts',
    'packages/core/src/math/svg-ink.ts',
  ]) add(join(root, path));
  cached = hash.digest('hex');
  return cached;
}

export function browserMathFingerprint(asset: string): string | undefined {
  return /^\/\*visser-math-policy:([a-f0-9]{64})\*\//.exec(asset)?.[1];
}
