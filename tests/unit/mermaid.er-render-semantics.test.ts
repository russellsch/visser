import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
// @ts-expect-error pinned Mermaid chunk has no declarations.
import {parseGenericTypes} from 'mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs';
const generic='node_modules/mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs',shape='node_modules/mermaid/dist/chunks/mermaid.core/chunk-7INBJB4K.mjs';
it('pins and executes Mermaid generic-type normalization, including its TeX-tilde interaction',()=>{
 expect(createHash('sha256').update(readFileSync(generic)).digest('hex')).toBe('47024e162ce56e54ebe58aba84e81d19ead8bcc973405ed13e08855a88ac6c64');
 expect(parseGenericTypes('List~String~')).toBe('List<String>');
 expect(parseGenericTypes('Map~String,Int~')).toBe('Map<String,Int>');
 expect(parseGenericTypes('List~String~ $$x~y$$')).toBe('List<String~ $$x>y$$');
 expect(parseGenericTypes(String.raw`List~String~ $$\text{a~b}$$`)).toBe(String.raw`List<String~ $$\text{a>b}$$`);
 expect(parseGenericTypes('$$x~y~z$$')).toBe('$$x<y>z$$');
 expect(parseGenericTypes('$$x<y$$')).toBe('$$x<y$$');
 expect(parseGenericTypes('&lt;')).toBe('&lt;');
 expect(parseGenericTypes(String.raw`$$\begin{matrix}a\\b\end{matrix}$$`)).toBe(String.raw`$$\begin{matrix}a\\b\end{matrix}$$`);
});
it('pins ER table text preprocessing and its simple-header boundary',()=>{
 const source=readFileSync(shape,'utf8');expect(createHash('sha256').update(source).digest('hex')).toBe('4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce');
 const start=source.indexOf('async function addText('),end=source.indexOf('__name(addText, "addText");',start);expect(source.slice(start,end)).toContain('parseGenericTypes(labelText)');
 const boxStart=source.indexOf('async function erBox('),boxEnd=source.indexOf('__name(erBox, "erBox");',boxStart),box=source.slice(boxStart,boxEnd);expect(box).toContain('if (entityNode.attributes.length === 0 && node.label)');expect(box).toContain('await drawRect(parent, node, options2)');expect(box).toContain('addText(shapeSvg, node.label');for(const field of ['attribute.type','attribute.name','attribute.keys.join()','attribute.comment'])expect(box).toMatch(new RegExp(`addText\\(\\s*shapeSvg,\\s*${field.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}`));
});
