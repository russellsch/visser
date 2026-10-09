import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';

export type RadarAxis={name:string;label:string};
export type RadarCurve=RadarAxis&{entries:number[]};
export type RadarOptions={showLegend:boolean;ticks:number;max:number|null;min:number;graticule:'circle'|'polygon'};
export type RadarMetadata={title:string;accTitle:string;accDescr:string};
export type RadarDbSnapshot=RadarMetadata&{version:1;axes:RadarAxis[];curves:RadarCurve[];options:RadarOptions};
export type RadarNativeDb={getAxes():RadarAxis[];getCurves():RadarCurve[];getOptions():RadarOptions;getDiagramTitle():string;getAccTitle():string;getAccDescription():string};
export type RadarDbInput=Readonly<{
 axes:ReadonlyArray<{name:string;label?:string}>;
 curves:ReadonlyArray<{name:string;label?:string;entries:ReadonlyArray<{value:number;axis?:{$refText:string}}>}>;
 options:ReadonlyArray<{name:keyof RadarOptions;value:boolean|number|string}>;
 // Common metadata must already have its native sanitation attested. This
 // replay does not substitute raw AST text for sanitized common DB values.
 metadata:RadarMetadata;
}>;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Radar native reconciliation: ${message}`);}

/** Native getters expose live arrays/objects, so capture all fields at once. */
export function captureRadarDb(db:RadarNativeDb):RadarDbSnapshot {
 return structuredClone({version:1,axes:db.getAxes(),curves:db.getCurves(),options:db.getOptions(),
  title:db.getDiagramTitle(),accTitle:db.getAccTitle(),accDescr:db.getAccDescription()});
}

/** Replay the pinned DB, including first-reference lookup and last options.
 * This preserves native numeric state and skipped-curve inputs; it does not
 * assert that a renderer can produce finite geometry from that state.
 */
export function replayRadarDb(input:RadarDbInput):RadarDbSnapshot {
 const {title,accTitle,accDescr}=input.metadata;
 if([title,accTitle,accDescr].some(value=>typeof value!=='string'))invalid('metadata must contain strings');
 const axes=input.axes.map(axis=>({name:axis.name,label:axis.label??axis.name}));
 const curves=input.curves.map(curve=>{
  if(!curve.entries.length)invalid('native curve requires an entry');
  let entries:number[];
  if(curve.entries[0]!.axis===undefined)entries=curve.entries.map(entry=>entry.value);
  else{
   if(!axes.length)invalid('reference entries require axes');
   entries=axes.map(axis=>{
    const entry=curve.entries.find(entry=>entry.axis?.$refText===axis.name);
    if(!entry)invalid(`missing entry for axis ${axis.label}`);
    return entry.value;
   });
  }
  return {name:curve.name,label:curve.label??curve.name,entries};
 });
 const options:RadarOptions={showLegend:true,ticks:5,max:null,min:0,graticule:'circle'};
 for(const option of input.options){
  switch(option.name){
   case 'showLegend':if(typeof option.value!=='boolean')invalid('legend option type differs');options.showLegend=option.value;break;
   case 'graticule':if(option.value!=='circle'&&option.value!=='polygon')invalid('graticule option differs');options.graticule=option.value;break;
   case 'ticks':case 'max':case 'min':if(typeof option.value!=='number')invalid('numeric option type differs');options[option.name]=option.value;break;
   default:invalid('unknown option');
  }
 }
 if(options.ticks>32)options.ticks=32;
 return structuredClone({version:1,axes,curves,options,title,accTitle,accDescr});
}

export function reconcileRadarDb(input:RadarDbInput,native:RadarDbSnapshot):RadarDbSnapshot {
 if(!isDeepStrictEqual(replayRadarDb(input),native))invalid('actual axes, curves, options or metadata differ');
 return structuredClone(native);
}
