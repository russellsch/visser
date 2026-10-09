import {expect,it} from 'vitest';
import {parseMermaid,clearMermaidParseCache} from '../../packages/core/src/mermaid/parse.ts';
const source='erDiagram\naccTitle: Example\nsubgraph g["Group<br> label"]\n A[Alias] {\n  string name PK "comment"\n }\nend\ng ||--o{ B : role\n';
it('checks ER source/state in the source worker and recovers across mixed families',()=>{
 clearMermaidParseCache();
 const figures=[
  {figureId:'math',type:'other' as const,source:'erDiagram\nA["$$x$$"]\n'},
  {figureId:'first',type:'other' as const,source,originalSource:source},
  {figureId:'invalid',type:'other' as const,source:'erDiagram\nA {\n string broken\n'},
  {figureId:'mismatch',type:'other' as const,source,originalSource:source.replace('Example','Forged')},
  {figureId:'info',type:'other' as const,info:true,source:'info\n'},
  {figureId:'last',type:'other' as const,source:source.replace('Example','Recovery')},
 ];
 const results=parseMermaid(figures);
 for(const id of ['first','info','last'])expect(results.get(id),JSON.stringify(results.get(id))).toMatchObject({ok:true});
 expect(results.get('math')).toMatchObject({ok:false,code:'E_MATH'});
 expect(results.get('invalid')).toMatchObject({ok:false});
 expect(results.get('mismatch')).toMatchObject({ok:false,code:'E_MATH'});
});
