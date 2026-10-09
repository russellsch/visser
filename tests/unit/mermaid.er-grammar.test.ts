import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error build scripts are outside TypeScript project.
import {patchERMathGrammar} from '../../scripts/mermaid-er-grammar.mjs';
// @ts-expect-error build scripts are outside TypeScript project.
import {patchERLayoutBoundary} from '../../scripts/mermaid-er-build.mjs';
const source=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs'),'utf8');
it('pins the artifact and changes only broad quoted INITIAL token admission',()=>{
 const original=source(),patched=patchERMathGrammar(original),marker='          case 14:\n            return 76;',replacement='          case 14:\n            return visserERMathQuoted(yy_.yytext) ? 53 : 76;';
 expect(patched.slice(patched.indexOf('\nimport ')+1).replace(replacement,marker)).toBe(original);
 expect(()=>patchERMathGrammar(original+'\n')).toThrow(/artifact changed/);
 expect(()=>patchERMathGrammar(original,patched)).toThrow(/already patched/);
 expect(()=>patchERMathGrammar(patched)).toThrow(/artifact changed/);
});
it('composes grammar admission with the exact original renderer boundary',()=>{
 const original=source(),layout=patchERLayoutBoundary(original,'/adapter.ts'),patched=patchERMathGrammar(original,layout);
 expect(patched.match(/function visserERMathQuoted\(/g)).toHaveLength(1);
 expect(patched.match(/erNativeGraph\(svg.node\(\), data4Layout\)/g)).toHaveLength(1);
});
it('preserves native role/comment semantics and exact authored locations while admitting command headers',()=>{
 const result=JSON.parse(execFileSync(process.execPath,[resolve('tests/fixtures/math/er-grammar.mjs')],{encoding:'utf8',timeout:30000}));
 expect(result).toEqual({admitted:9,rejected:10,nativeRoleAndCommentParity:true,receiptModes:2,forbiddenLocated:true});
},35000);
