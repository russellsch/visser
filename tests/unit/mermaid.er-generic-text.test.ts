import {expect,it} from 'vitest';
// @ts-expect-error pinned native helper has no declarations.
import {parseGenericTypes} from 'mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs';
import {erGenericText,erGenericTextEdits} from '../../packages/core/src/mermaid/er-generic-text.ts';
import {mapERGenericText} from '../../packages/core/src/mermaid/er-generic-provenance.ts';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';

it('keeps equations opaque while converting generic prose and wrappers',()=>{
 const cases=[
  ['List~String~ $$x~y$$','List<String> $$x~y$$'],
  ['List~$$x~y$$~','List<$$x~y$$>'],
  ['Map~String,$$a,b~c$$~','Map<String,$$a,b~c$$>'],
  ['$$x~y~z$$','$$x~y~z$$'],
  ['~A~B~ $$x$$','~A<B> $$x$$'],
  ['😀List~$$x<y & z$$~ &lt;','😀List<$$x<y & z$$> &lt;'],
  [String.raw`List~String~ $$\begin{matrix}a&b\\c&d\end{matrix}$$`,String.raw`List<String> $$\begin{matrix}a&b\\c&d\end{matrix}$$`],
  ['List~$$x$$~ $$x$$','List<$$x$$> $$x$$'],
 ];
 for(const [input,expected]of cases)expect(erGenericText(input!)).toBe(expected);
});

it('retains accumulated prefixes on native destructive overlapping comma groups',()=>{
 for(const [input,expected]of [
  ['a~,b~,c~ $$x$$','a<,b~,c> $$x$$'],
  ['$$x$$~,b~,c~','$$x$$<,b~,c>'],
  ['a~,b~,c~,d~','a<,b<,c>,d>'],
 ]){expect(erGenericText(input!)).toBe(expected);expect(erGenericText(input!).length).toBe(input!.length);expect(parseGenericTypes(input)).not.toBe(expected);}
});

it('matches the native helper for non-overlapping generic prose groups',()=>{
 const segments=['','A','~','A~','~A','A~B~','~A~B~','Map~String','Int~','😀~B~'];
 // Two comma-separated segments cannot trigger the native overlapping loss.
 for(const a of segments)for(const b of segments){const input=`${a},${b}`;expect(erGenericText(input),input).toBe(parseGenericTypes(input));}
});

it('maps exact UTF-16 origins, including repeated TeX, Unicode and replaced tildes',()=>{
 const source='prefix 😀List~$$x~y$$~ $$x~y$$ suffix';
 const root=ProvenanceText.identity(source),input=root.slice(7,source.length-7),mapped=mapERGenericText(input);
 expect(mapped.text).toBe(erGenericText(input.text));
 expect(mapped.length).toBe(input.length);
 for(let i=0;i<mapped.length;i++)expect(mapped.mapRange(i,i+1)).toEqual(input.mapRange(i,i+1));
 for(const edit of erGenericTextEdits(input.text)){expect(input.text.slice(edit.start,edit.end)).toBe('~');expect(edit.end-edit.start).toBe(1);}
});

it('does not decode entities, change TeX escapes or join multiline delimiters',()=>{
 for(const input of ['&dollar;&dollar;x&dollar;&dollar;','$$x&amp;y$$','$$a\\\\b$$','$$x\ny$$','$$unterminated'])expect(erGenericText(input)).toBe(input);
});
