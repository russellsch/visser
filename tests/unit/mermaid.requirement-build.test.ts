import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error build script is checked JavaScript outside tsconfig.
import {patchRequirementRenderer,patchRequirementRows} from '../../scripts/mermaid-requirement-build.mjs';

const renderer=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/requirementDiagram-PLB6GJNP.mjs'),'utf8');
const shapes=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-7INBJB4K.mjs'),'utf8');

it('pins Requirement renderer and shape artifacts, injects its draw wrapper once, and leaves the DB getter intact',()=>{
 const source=renderer(),patched=patchRequirementRenderer(source,'/adapter.mjs');
 expect(patched.startsWith('import {createRequirementMathRenderer} from "/adapter.mjs";\n')).toBe(true);
 expect(patched.match(/draw = createRequirementMathRenderer\(/g)).toHaveLength(1);
 expect(patched).toContain('draw = createRequirementMathRenderer({original:draw,getConfig:getConfig2,normalize:input=>sanitizeText2(decodeEntities(input))});\nvar diagram = {');
 expect(patched).toContain('get db() {\n    return new RequirementDB();\n  }');
 expect(()=>patchRequirementRenderer(source+'\n// changed\n','/adapter.mjs')).toThrow(/Requirement renderer artifact changed/);
 expect(()=>patchRequirementRenderer(patched,'/adapter.mjs')).toThrow(/Requirement renderer artifact changed/);
});

it('patches exactly nine native Requirement row calls in semantic order and preserves unrelated shape source',()=>{
 const source=shapes(),start=source.indexOf('async function requirementBox(parent, node) {'),end=source.indexOf('__name(requirementBox, "requirementBox");',start),patched=patchRequirementRows(source,'/adapter.mjs');
 expect(start).toBeGreaterThanOrEqual(0);expect(end).toBeGreaterThan(start);
 expect(patched.startsWith('import {requirementRows} from "/adapter.mjs";\n')).toBe(true);
 const roles=[...patched.matchAll(/visserRows\.add\("([^"]+)",/g)].map(match=>match[1]);
 expect(roles).toEqual(['stereotype','stereotype','name','id','text','risk','verifyMethod','type','docRef']);
 expect(patched).toContain('const visserRows = requirementRows(parent,node,{native:addText3,normalize:input=>sanitizeText2(decodeEntities(input))});');
 expect(patched).toContain('visserRows.finish();');expect(patched).toContain('const visserBounds = shapeSvg.node().getBBox();');
 expect(patched).toContain('shapeSvg.selectAll(visserRows.active ? ":scope > .outer-path path, :scope > .divider path, :scope > path" : "path").attr("style", nodeStyles);');
 const patchedStart=patched.indexOf('async function requirementBox(parent, node) {'),patchedEnd=patched.indexOf('__name(requirementBox, "requirementBox");',patchedStart);
 expect(patched.slice(patchedEnd)).toBe(source.slice(end));
 expect(patched.slice(patchedStart,patchedEnd)).not.toBe(source.slice(start,end));
 expect(()=>patchRequirementRows(source+'\n// changed\n','/adapter.mjs')).toThrow(/Requirement shape artifact changed/);
 expect(()=>patchRequirementRows(patched,'/adapter.mjs')).toThrow(/Requirement shape artifact changed/);
});
