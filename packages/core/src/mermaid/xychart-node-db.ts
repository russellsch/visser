import {captureXYVisibility} from './xychart-visibility.ts';
import { MathPolicyError } from '../math/policy.ts';
import { prepareSequenceSanitizer } from './sequence-sanitize.ts';
import { withStateSanitizer } from './state-node-db.ts';
import { captureXYBaseline,captureXYDb,type XYDbBaseline,type XYNativeDb } from './xychart-db.ts';

type Db=XYNativeDb & Record<string,(...args:unknown[])=>unknown>;
let installed:Promise<void>|undefined,nativeDb:Db|undefined,baseline:XYDbBaseline|undefined;

/** Keep real native setter order; provide DOMPurify only during synchronous calls. */
export function installXYNodeDb():Promise<void> {
 if(!installed)installed=(async()=>{
  await prepareSequenceSanitizer();
  // @ts-expect-error pinned internal chunk has no declarations.
  const {diagram,visserXYContractVersion}=await import('mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs');
  if(visserXYContractVersion!==1)throw new MathPolicyError('E_MATH_INVALID','XY native contract patch is missing');
  const db=diagram.db as Db;
  const setters=['setDiagramTitle','setAccTitle','setAccDescription','setXAxisTitle','setXAxisBand','setYAxisTitle','setLineData','setBarData'];
  const required=[...setters,'clear','getXYChartData','getDiagramTitle','getAccTitle','getAccDescription','getChartConfig','getChartThemeConfig'];
  if(required.some(name=>typeof db[name]!=='function'))throw new MathPolicyError('E_MATH_INVALID','pinned XY DB contract changed');
  const clear=db['clear']!;
  db['clear']=(...args:unknown[])=>{
   baseline=undefined;
   const result=clear.apply(db,args);
   baseline=captureXYBaseline(db);
   return result;
  };
  for(const name of setters){const native=db[name]!;db[name]=(...args:unknown[])=>withStateSanitizer(()=>native.apply(db,args));}
  nativeDb=db;
 })().catch(error=>{installed=undefined;throw error;});
 return installed;
}

/** Called synchronously before source collection can await or touch another DB. */
export function captureXYNodeState(db:object) {
 if(db!==nativeDb||!baseline)throw new MathPolicyError('E_MATH_INVALID','XY parse transaction has no native clear-state baseline');
 return {baseline:{...baseline},snapshot:captureXYDb(nativeDb),visibility:captureXYVisibility(nativeDb['getChartConfig']!())};
}
