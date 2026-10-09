import { MathPolicyError } from '../math/policy.ts';
import { prepareSequenceSanitizer } from './sequence-sanitize.ts';
import { withStateSanitizer } from './state-node-db.ts';
let installed=false;
export async function installQuadrantNodeDb():Promise<void> {
 await prepareSequenceSanitizer();
 if(installed)return;
 // @ts-expect-error pinned internal chunk has no declarations.
 const {diagram,quadrantSnapshotVersion}=await import('mermaid/dist/chunks/mermaid.core/quadrantDiagram-O4NWA36T.mjs');
 if(quadrantSnapshotVersion!==1)throw new MathPolicyError('E_MATH_INVALID','quadrant snapshot patch is missing');
 const db=diagram.db;
 const methods=['setDiagramTitle','setAccTitle','setAccDescription','setQuadrant1Text','setQuadrant2Text','setQuadrant3Text','setQuadrant4Text','setXAxisLeftText','setXAxisRightText','setYAxisBottomText','setYAxisTopText','addPoint'];
 if(methods.some(name=>typeof db[name]!=='function'))throw new MathPolicyError('E_MATH_INVALID','pinned quadrant setters changed');
 for(const name of methods){const native=db[name];db[name]=(...args:unknown[])=>withStateSanitizer(()=>native.apply(db,args));}
 installed=true;
}
