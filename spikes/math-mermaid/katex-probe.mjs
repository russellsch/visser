// W0 probe: standalone KaTeX package matches the browser bundle's effective
// throwOnError/displayMode/mathml options. This does not extract Mermaid labels.
// Run: node spikes/math-mermaid/katex-probe.mjs
import katex from 'katex';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(readFileSync(join(here,'../../node_modules/katex/package.json'),'utf8')).version;
const options={throwOnError:true,displayMode:true,output:'mathml'};
const equations={valid:'x^2',invalid:'\\notacommand{x}',matrix:'\\begin{matrix}a&b\\\\c&d\\end{matrix}'};
const results={version,options,equations:{}};
for(const [name,tex] of Object.entries(equations)) {
  try {const html=katex.renderToString(tex,options);results.equations[name]={ok:true,math:html.includes('<math'),bytes:Buffer.byteLength(html)};}
  catch(e){results.equations[name]={ok:false,error:String(e).slice(0,250)};}
}
mkdirSync(join(here,'results'),{recursive:true});
writeFileSync(join(here,'results/katex.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
