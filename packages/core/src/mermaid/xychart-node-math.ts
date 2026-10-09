import { captureXYNodeState } from './xychart-node-db.ts';
import { extractXYMath } from './xychart-math.ts';
import { reconcileXYDb } from './xychart-db.ts';
import { xyMathTransport,type XYRenderMath } from './xychart-transport.ts';

export async function extractXYNodeMath(original:string,rendered:string,db:object):Promise<XYRenderMath|undefined> {
 // No asynchronous work may intervene between reading baseline and native state.
 const {baseline,snapshot,visibility}=captureXYNodeState(db);
 const math=await extractXYMath(original,undefined,rendered);
 if(!math.total.occurrences)return undefined;
 const plan=reconcileXYDb(math,snapshot,baseline);
 return xyMathTransport(math,plan.snapshot,baseline,plan.candidates,visibility);
}
