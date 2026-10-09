import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
import {normalizeKanbanField,traceKanbanField,mapKanbanMathInput} from '../../packages/core/src/mermaid/kanban-normalize.ts';
import {kanbanMathText} from '../../packages/core/src/mermaid/kanban-text.ts';

it('matches actual native DB and label-helper sanitation functions for every role and mode',()=>{
 for(const args of [[],['--svg-first']]){
  const output=execFileSync(process.execPath,[resolve('tests/fixtures/math/kanban-field-oracle.mjs'),...args],{encoding:'utf8',timeout:30000});
  expect(JSON.parse(output)).toEqual({cases:88});
 }
},40000);

it('decodes private entity sentinels at the section math hook without adding a sanitation stage',async()=>{
 const value=ProvenanceText.identity('$$xﬂ°amp¶ßy$$');
 const section=await normalizeKanbanField(value,'section',false);
 expect(section.nativeInput.text).toBe(value.text);
 expect(section.mappedInput.text).toBe('$$x&y$$');
 expect(section.renderer).toBeUndefined();
 expect(Object.keys(section.witnesses)).toEqual(['db']);
 expect(section.mappedInput.mapRange(0,section.mappedInput.length)).toEqual({synthetic:false,intervals:[{start:0,end:value.length}]});
});

it('keeps math text and provenance transforms equal without collapsing TeX backslashes',()=>{
 const cases=['plain &dollar;&dollar;x&dollar;&dollar;','$$x&amp;y$$','$$\\begin{matrix}a&b\\\\c&d\\end{matrix}$$','$$x<br/>y$$','<BR> $$x&lt;y$$','ﬂ°°36¶ß'];
 for(const source of cases)expect(mapKanbanMathInput(ProvenanceText.identity(source)).text).toBe(kanbanMathText(source));
 expect(kanbanMathText(cases[0]!)).toBe(cases[0]);
 expect(kanbanMathText(cases[2]!)).toBe(cases[2]);
 expect(kanbanMathText('$$x&amp;amp;y$$')).toBe('$$x&amp;y$$');
});

it('requires exact role stages and modes, including empty strings',async()=>{
 const input=ProvenanceText.identity('');
 const emptyFalse={htmlLabels:false,passes:[]} as const,emptyTrue={htmlLabels:true,passes:[]} as const;
 for(const witnesses of [null,[],{}, {db:emptyFalse}, {db:emptyTrue,renderer:emptyFalse},{db:emptyTrue,renderer:emptyTrue,extra:1}])expect(()=>traceKanbanField(input,'title',true,witnesses as any)).toThrow(/kanban normalization/);
 expect(()=>traceKanbanField(input,'section',true,{db:emptyTrue,renderer:emptyFalse})).toThrow(/stages differ/);
 expect(()=>traceKanbanField(input,'ticket',true,{db:emptyTrue,renderer:emptyFalse})).toThrow(/stages differ/);
 expect(()=>traceKanbanField(input,'title',true,{db:emptyFalse,renderer:emptyFalse})).toThrow(/mode differs/);
 await expect(normalizeKanbanField(input,'unknown' as any,true)).rejects.toMatchObject({code:'E_MATH_INVALID'});
 await expect(normalizeKanbanField(input,'section','true' as any)).rejects.toMatchObject({code:'E_MATH_INVALID'});
 for(const role of ['section','title','ticket','assigned'] as const){const result=await normalizeKanbanField(input,role,true);expect(result.mappedInput.text).toBe('');}
});
