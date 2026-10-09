import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchStateObserver } from './mermaid-state-observer-build.mjs';

const artifact = /[/\\]stateDiagram-v2-GCMORJYK\.mjs$/;

/** Install before importing Mermaid. Preserve its module URL and relative imports. */
export function stateObserverLoadHook(observerUrl) {
  return (url, context, nextLoad) => {
    const loaded = nextLoad(url, context);
    if (!url.startsWith('file:') || !artifact.test(fileURLToPath(url))) return loaded;
    if (loaded.format !== 'module' || loaded.source == null) throw new Error('State observer requires original ESM source');
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    return { ...loaded, source: patchStateObserver(source, observerUrl) };
  };
}

/** Same source transform for worker bundles and browser characterization. */
export function stateObserverPlugin(root) {
  return {
    name: 'visser-state-observer',
    setup(build) {
      let count = 0;
      build.onStart(() => { count = 0; });
      build.onLoad({ filter: artifact }, ({ path }) => {
        count++;
        return { contents: patchStateObserver(readFileSync(path, 'utf8'), join(root, 'packages/core/src/mermaid/state-observer.ts')), loader: 'js' };
      });
      build.onEnd(() => count === 1 ? undefined : { errors: [{ text: `Expected one state observer artifact; patched ${count}` }] });
    },
  };
}

export function stateObserverModuleUrl(root) {
  return pathToFileURL(join(root, 'packages/core/src/mermaid/state-observer.ts')).href;
}
