import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parse} from '@mermaid-js/parser';
import {describe,expect,it} from 'vitest';

const nativeInfoPath=resolve('node_modules/mermaid/dist/chunks/mermaid.core/infoDiagram-VRGFBTTK.mjs');
const parserEntryPath=resolve('node_modules/@mermaid-js/parser/dist/mermaid-parser.esm.mjs');
const parserInfoPath=resolve('node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.esm/info-JQRVFZIU.mjs');
const parserInfoServicesPath=resolve('node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.esm/chunk-QTXQJRYY.mjs');
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');

const source=`info
title $$title-first$$
title $$title-final$$
accTitle: $$access-title-first$$
accTitle: $$access-title-final$$
accDescr: $$access-description-first$$
accDescr: $$access-description-final$$
`;

const cstLeaves=(node:any):Array<{text:string;offset:number;end:number}>=>{
 const result:Array<{text:string;offset:number;end:number}>=[];
 const visit=(current:any):void=>{
  const children=current?.content;
  if(children){for(const child of children)visit(child);return;}
  if(typeof current?.text==='string')result.push({text:current.text,offset:current.offset,end:current.end});
 };
 visit(node);
 return result;
};

describe('Info diagram authored-field inventory',()=>{
 it('accepts repeated title and accessibility fields while retaining every concrete CST occurrence',async()=>{
  const ast:any=await parse('info',source);
  expect(ast.$type).toBe('Info');
  expect(ast).toMatchObject({title:'$$title-final$$',accTitle:'$$access-title-final$$',accDescr:'$$access-description-final$$'});
  const fields=cstLeaves(ast.$cstNode).filter(({text})=>/^(title|accTitle:|accDescr:)/.test(text));
  expect(fields).toEqual([
   {text:'title $$title-first$$',offset:5,end:26},
   {text:'title $$title-final$$',offset:27,end:48},
   {text:'accTitle: $$access-title-first$$',offset:49,end:81},
   {text:'accTitle: $$access-title-final$$',offset:82,end:114},
   {text:'accDescr: $$access-description-first$$',offset:115,end:153},
   {text:'accDescr: $$access-description-final$$',offset:154,end:192}
  ]);
  for(const field of fields)expect(source.slice(field.offset,field.end)).toBe(field.text);
 });

 it('characterizes the standard info/showInfo entry forms and rejects arbitrary labels',async()=>{
  await expect(parse('info','info showInfo')).resolves.toMatchObject({$type:'Info'});
  await expect(parse('info','info\nshowInfo\n')).resolves.toMatchObject({$type:'Info'});
  await expect(parse('info','info')).resolves.toMatchObject({$type:'Info'});
  await expect(parse('info','showInfo')).rejects.toThrow(/Expecting token of type 'info'/);
  await expect(parse('info','info\nordinary $$not-a-field$$\n')).rejects.toThrow(/Lexer error/);
  const parserInfo=readFileSync(parserInfoServicesPath,'utf8');
  expect(parserInfo).toContain('super(["info", "showInfo"])');
 });

 it('pins the fixed native version renderer and records that it does not draw authored fields',()=>{
  const native=readFileSync(nativeInfoPath,'utf8');
  expect(digest(nativeInfoPath)).toBe('7ab91ef6d2e46ac243cba517155dd24db6a54ac6b4a27690fe34bcf9027172c8');
  expect(digest(parserEntryPath)).toBe('35908a13f5906e3ab6ea36fa75866d6c8b75a535ce62871e9176da7c766da4af');
  expect(digest(parserInfoPath)).toBe('9818fb2141dd8598446c634d8732d2b048dc5879230ca032d95e432d28775b48');
  expect(digest(parserInfoServicesPath)).toBe('3d6b713acd749de921dceb0ddb5bdb6102ee07cf20d31d75d0059726b3151c26');
  expect(native).toContain('configureSvgSize(svg, 100, 400, true);');
  expect(native).toContain('var DEFAULT_INFO_DB = {\n  version: "12.0.0" + (true ? "" : "-tiny")\n};');
  expect(native).toContain('.text(`v${version}`);');
  expect(native).not.toMatch(/\.text\(.*(?:ast\.(?:title|accTitle|accDescr)|title|accTitle|accDescr)/s);
 });
});
