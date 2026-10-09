import {MathPolicyError} from '../math/policy.ts';
import {prepareSequenceSanitizer} from './sequence-sanitize.ts';
import {withStateSanitizer} from './state-node-db.ts';
import {captureSankeyDb,type SankeyNativeDb} from './sankey-db.ts';
type Db=SankeyNativeDb & Record<string,(...args:unknown[])=>unknown>;
let installed:Promise<void>|undefined,nativeDb:Db|undefined,cleared=false;

export function installSankeyNodeDb():Promise<void> {
 if(!installed)installed=(async()=>{
  await prepareSequenceSanitizer();
  // @ts-expect-error pinned internal chunk has no declarations.
  const {diagram,visserSankeyContractVersion}=await import('mermaid/dist/chunks/mermaid.core/sankeyDiagram-IPEJSGJF.mjs');
  if(visserSankeyContractVersion!==1)throw new MathPolicyError('E_MATH_INVALID','Sankey native contract patch is missing');
  const db=diagram.db as Db;
  if(['clear','findOrCreateNode','getGraph','getDiagramTitle','getAccTitle','getAccDescription'].some(name=>typeof db[name]!=='function'))throw new MathPolicyError('E_MATH_INVALID','pinned Sankey DB contract changed');
  const clear=db['clear']!,find=db['findOrCreateNode']!;
  db['clear']=(...args:unknown[])=>{cleared=false;const result=clear.apply(db,args);cleared=true;return result;};
  db['findOrCreateNode']=(...args:unknown[])=>withStateSanitizer(()=>find.apply(db,args));
  nativeDb=db;
 })().catch(error=>{installed=undefined;throw error;});
 return installed;
}

/** The worker calls this synchronously after its final successful native parse. */
export function captureSankeyNodeState(db:object){
 if(db!==nativeDb||!cleared)throw new MathPolicyError('E_MATH_INVALID','Sankey parse transaction has no native clear state');
 return captureSankeyDb(nativeDb);
}
