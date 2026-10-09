import {captureSankeyNodeState} from './sankey-node-db.ts';
import {extractSankeyMath} from './sankey-math.ts';
import {reconcileSankeyDb} from './sankey-db.ts';
import {sankeyMathTransport,type SankeyRenderMath} from './sankey-transport.ts';

export async function extractSankeyNodeMath(original:string,rendered:string,db:object):Promise<SankeyRenderMath|undefined>{
 const snapshot=captureSankeyNodeState(db);
 const math=await extractSankeyMath(original,undefined,rendered);
 if(!math.total.occurrences)return undefined;
 const plan=reconcileSankeyDb(math,snapshot);
 return sankeyMathTransport(math,plan.snapshot,plan.candidates);
}
