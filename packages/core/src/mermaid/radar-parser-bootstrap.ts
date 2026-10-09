// The bootstrap-only entry imports this module, then dynamically imports the
// worker implementation. Static imports of that implementation would load the
// parser before this hook runs. Bundled workers use the build hook.
import {registerHooks} from 'node:module';
// @ts-expect-error checked source loader outside the TS project.
import {radarParserContractLoadHook} from '../../../../scripts/mermaid-radar-parser-contract.mjs';
let sourceMode=false;
try{sourceMode=import.meta.url?.endsWith('/radar-parser-bootstrap.ts')??false;}catch{/* bundled CJS */}
if(sourceMode)registerHooks({load:radarParserContractLoadHook()});
