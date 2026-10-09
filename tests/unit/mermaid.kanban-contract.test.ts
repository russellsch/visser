import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error build helper is plain JavaScript.
import { patchKanbanContract, kanbanContractLoadHook, kanbanContractPlugin } from '../../scripts/mermaid-kanban-contract.mjs';

const path = resolve('node_modules/mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs');
const source = readFileSync(path, 'utf8');

it('pins the full Kanban grammar, DB and renderer artifact and rejects drift or reapplication', () => {
 const patched = patchKanbanContract(source);
 expect(patched).toBe(source + '\nexport const visserKanbanContractVersion = 3;\nexport function visserCaptureKanbanDb() { return structuredClone({ nodes, sections, counter: cnt }); }\nexport function visserCaptureKanbanConfig() { const config = getConfig(), mindmap = config.mindmap; return structuredClone({ securityLevel: config.securityLevel, htmlLabels: config.htmlLabels, mindmap: { padding: mindmap?.padding ?? defaultConfig_default.mindmap.padding, maxNodeWidth: mindmap?.maxNodeWidth ?? defaultConfig_default.mindmap.maxNodeWidth } }); }\nexport function visserPrepareKanbanSanitizer() { sanitizeText("visser-kanban-sanitizer", { ...getConfig(), htmlLabels: true, securityLevel: "strict" }); }\n');
 expect(() => patchKanbanContract(source.replace('var nodes = [];', 'var nodes = [1];'))).toThrow(/artifact changed/);
 expect(() => patchKanbanContract(patched)).toThrow(/artifact changed/);
});

it('validates only its native module in the Node load hook', () => {
 const load = kanbanContractLoadHook(), original = {format:'module', source};
 expect(load(pathToFileURL(path).href, {}, () => original).source).toContain('visserKanbanContractVersion = 3');
 expect(load(pathToFileURL(path).href, {}, () => ({format:'module',source:Buffer.from(source)})).source).toBe(patchKanbanContract(source));
 expect(load('file:///tmp/unrelated.mjs', {}, () => original)).toBe(original);
 expect(() => load(pathToFileURL(path).href, {}, () => ({format:'commonjs',source}))).toThrow(/original ESM/);
});

it('requires exactly one native artifact per build and resets the count between builds', () => {
 let start:()=>void, end:()=>any, load:(args:{path:string})=>any;
 kanbanContractPlugin().setup({onStart:(fn:any)=>{start=fn;},onEnd:(fn:any)=>{end=fn;},onLoad:(_:any,fn:any)=>{load=fn;}});
 start!();expect(end!().errors[0].text).toContain('patched 0');
 expect(load!({path}).contents).toBe(patchKanbanContract(source));expect(end!()).toBeUndefined();
 load!({path});expect(end!().errors[0].text).toContain('patched 2');
 start!();expect(end!().errors[0].text).toContain('patched 0');
});
