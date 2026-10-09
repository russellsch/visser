// W0 proof of a grammar-scoped, source-located math check for one `other`
// family. It is intentionally not a universal Mermaid adapter.
// Run: node spikes/math-mermaid/extract-probe.mjs
import { parse } from '@mermaid-js/parser';
import katex from 'katex';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
const here=dirname(fileURLToPath(import.meta.url));
const source='pie\n "$$x^2$$" : 1\n "$$\\notacommand{x}$$" : 2';
const ast=await parse('pie',source);
const results=[];
for(const section of ast.sections) {
  // The first CST leaf is PIE_SECTION_LABEL, not an arbitrary source scan.
  const labelToken=section.$cstNode?.content?.[0];
  if (!labelToken?.text || labelToken.offset===undefined) throw new Error('pie label CST location unavailable');
  const token=labelToken.text;
  for(const m of token.matchAll(/\$\$(.*?)\$\$/g)) {
    const utf16Offset=labelToken.offset+m.index;
    const byteOffset=Buffer.byteLength(source.slice(0,utf16Offset),'utf8');
    const tex=m[1];
    const record={label:section.label,tex,line:labelToken.range.start.line+1,column:labelToken.range.start.character+m.index+1,byteOffset};
    try{katex.renderToString(tex,{throwOnError:true,displayMode:true,output:'mathml'});record.ok=true;}
    catch(e){record.ok=false;record.error=String(e).slice(0,180);}
    results.push(record);
  }
}
mkdirSync(join(here,'results'),{recursive:true});
writeFileSync(join(here,'results/extract.json'),JSON.stringify({source,results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
