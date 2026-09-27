// Executable entry: the release bundle runs this file; tests import main.ts.
import { join } from 'node:path';
import { setMermaidWorkerPath } from '../../core/src/mermaid/index.ts';
import { main } from './main.ts';
import { bundledReleaseDir } from './toolkit.ts';

// From a release, Mermaid figures are parsed by the bundled worker (§9.12).
const release = bundledReleaseDir();
if (release) setMermaidWorkerPath(join(release, 'workers', 'mermaid-parse.cjs'));

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
