import { isDeepStrictEqual } from 'node:util';
import { MathPolicyError } from '../math/policy.ts';
import { extractQuadrantMath } from './quadrant-math.ts';
import { reconcileQuadrantDb,type QuadrantDbSnapshot,type QuadrantStyles } from './quadrant-db.ts';
import { quadrantMathTransport,type QuadrantRenderMath } from './quadrant-transport.ts';
type Db=Record<string,(...args:unknown[])=>unknown>;
export async function extractQuadrantNodeMath(original:string,rendered:string,db:Db):Promise<QuadrantRenderMath|undefined>{
 // @ts-expect-error patched pinned internal chunk has no declarations.
 const native=await import('mermaid/dist/chunks/mermaid.core/quadrantDiagram-O4NWA36T.mjs');
 if(native.quadrantSnapshotVersion!==1||native.diagram.db!==db)throw new MathPolicyError('E_MATH_INVALID','quadrant snapshot identity differs');
 const snapshot=native.getVisserQuadrantSnapshot() as QuadrantDbSnapshot;
 // Capture built output before asynchronous source collection as well.
 const built=structuredClone(db['getQuadrantData']!()) as {title?:{text:string};quadrants:Array<{text:{text:string}}>;axisLabels:Array<{text:string}>;points:Array<{text:{text:string}}>};
 const math=await extractQuadrantMath(original,undefined,rendered);
 if(!math.total.occurrences)return undefined;
 const plan=reconcileQuadrantDb(math,snapshot,styles=>db['parseStyles']!(styles) as QuadrantStyles);
 const expected={title:snapshot.title||undefined,quadrants:[snapshot.data.quadrant1Text,snapshot.data.quadrant2Text,snapshot.data.quadrant3Text,snapshot.data.quadrant4Text],axes:[snapshot.data.xAxisLeftText,snapshot.data.xAxisRightText,snapshot.data.yAxisBottomText,snapshot.data.yAxisTopText].filter(Boolean),points:snapshot.data.points.map(p=>p.text)};
 const actual={title:built.title?.text,quadrants:built.quadrants.map(q=>q.text.text),axes:built.axisLabels.map(a=>a.text),points:built.points.map(p=>p.text.text)};
 if(!isDeepStrictEqual(actual,expected))throw new MathPolicyError('E_MATH_INVALID','quadrant visible native output differs');
 return quadrantMathTransport(math,plan.snapshot,plan.candidates);
}
