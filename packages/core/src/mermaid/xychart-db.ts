import { isDeepStrictEqual } from 'node:util';
import { MathPolicyError } from '../math/policy.ts';
import type { XYMath } from './xychart-math.ts';
import type { XYLabelRole, XYLabelRecord, XYEffect } from './xychart-labels.ts';

export type XYLinearAxis = { type:'linear'; title:string; min:number; max:number };
export type XYBandAxis = { type:'band'; title:string; categories:string[] };
export type XYPlot = {
  type:'line'|'bar'; title:string; data:Array<[string,number|undefined]>;
  strokeFill?:string;strokeWidth?:number;fill?:string;pointLabels?:string[];
};
export type XYDbSnapshot = {
  version:1; data:{title:string;xAxis:XYLinearAxis|XYBandAxis;yAxis:XYLinearAxis;plots:XYPlot[]};
  title:string;accTitle:string;accDescr:string;orientation:'vertical'|'horizontal';
};
export type XYDbBaseline = Readonly<{orientation:'vertical'|'horizontal';plotColorPalette:string}>;
export type XYOwnedSlot = Readonly<{key:string;role:XYLabelRole;recordIndex:number;seriesIndex?:number;memberIndex?:number}>;
export type XYNativeDb = {
  getXYChartData():XYDbSnapshot['data'];getDiagramTitle():string;getAccTitle():string;getAccDescription():string;
  getChartConfig():{chartOrientation:'vertical'|'horizontal'};
  getChartThemeConfig():{plotColorPalette:string};
};
const invalid=(message:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`XY native reconciliation: ${message}`);};

/** Capture after native clear, before parsing source orientation declarations. */
export function captureXYBaseline(db:XYNativeDb):XYDbBaseline {
  return Object.freeze({orientation:db.getChartConfig().chartOrientation,plotColorPalette:db.getChartThemeConfig().plotColorPalette});
}
/** Capture synchronously after parse and before getDrawableElem mutates data.title. */
export function captureXYDb(db:XYNativeDb):XYDbSnapshot {
  return structuredClone({version:1,data:db.getXYChartData(),title:db.getDiagramTitle(),accTitle:db.getAccTitle(),accDescr:db.getAccDescription(),orientation:db.getChartConfig().chartOrientation});
}

export type XYReconcileInput = Readonly<{
  records: ReadonlyArray<Pick<XYMath['records'][number],'recordIndex'|'role'|'dbValue'>>;
  labels: Readonly<{records:ReadonlyArray<Pick<XYLabelRecord,'recordIndex'|'role'|'seriesIndex'|'memberIndex'>>;effects:readonly XYEffect[]}>;
}>;

/** Replay semantic effects, not source text. Later axes must not rewrite prior plots. */
export function reconcileXYDb(math:XYReconcileInput,native:XYDbSnapshot,baseline:XYDbBaseline):{
  snapshot:XYDbSnapshot;candidates:readonly XYOwnedSlot[];
} {
  if(!['vertical','horizontal'].includes(baseline.orientation) || typeof baseline.plotColorPalette!=='string') invalid('invalid clear-state baseline');
  if(math.records.length!==math.labels.records.length) invalid('authored record coverage differs');
  const byId=new Map<number,XYReconcileInput['records'][number]>();
  for(const [index,record] of math.records.entries()) {
    const authored=math.labels.records[index]!;
    if(record.recordIndex!==index+1 || authored.recordIndex!==record.recordIndex || authored.role!==record.role) invalid('authored identity differs');
    byId.set(record.recordIndex,record);
  }
  let nextRecord=1;
  const use=(index:number,role:XYLabelRole,seriesIndex?:number,memberIndex?:number):string=>{
    const record=byId.get(index),authored=math.labels.records[index-1];
    if(index!==nextRecord++ || !record || record.role!==role || authored?.seriesIndex!==seriesIndex || authored?.memberIndex!==memberIndex) invalid('callback ownership or order differs');
    return record!.dbValue;
  };
  const expected:XYDbSnapshot={version:1,data:{title:'',xAxis:{type:'band',title:'',categories:[]},yAxis:{type:'linear',title:'',min:Infinity,max:-Infinity},plots:[]},title:'',accTitle:'',accDescr:'',orientation:baseline.orientation};
  const data=expected.data,palette=baseline.plotColorPalette.split(',').map(color=>color.trim());
  let hasX=false,hasY=false,categoryOwners:readonly number[]=[];
  const finalFields=new Map<'title'|'xTitle'|'yTitle',number>();
  const plotOwners:Array<{title:number;labels:readonly number[]}> = [];
  const finite=(value:number):number=>{
    if(typeof value!=='number'||!Number.isFinite(value)) invalid('nonfinite authored numeric data');
    return value;
  };
  const transform=(input:readonly number[]):Array<[string,number|undefined]>=>{
    if(input.length===0)return [];
    if(!hasX) {
      const min=data.xAxis.type==='linear'?data.xAxis.min:Infinity;
      const max=data.xAxis.type==='linear'?data.xAxis.max:-Infinity;
      data.xAxis={type:'linear',title:data.xAxis.title,min:Math.min(min,1),max:Math.max(max,input.length)};
      categoryOwners=[];hasX=true;
    }
    let values=[...input];
    if(data.xAxis.type==='band' && values.length>data.xAxis.categories.length) values=values.slice(0,data.xAxis.categories.length);
    if(!hasY) data.yAxis={...data.yAxis,min:Math.min(data.yAxis.min,...values),max:Math.max(data.yAxis.max,...values)};
    if(data.xAxis.type==='band') return data.xAxis.categories.map((category,index)=>[category,values[index]]);
    const {min,max}=data.xAxis;
    if(values.length===1)return [[`${min}`,values[0]]];
    const step=(max-min)/(values.length-1);
    return values.map((value,index)=>[`${min+index*step}`,value]);
  };
  for(const effect of math.labels.effects) {
    switch(effect.method) {
      case 'setOrientation':
        if(!/^(vertical|horizontal)$/i.test(effect.orientation)) invalid('unknown authored orientation');
        // Native lexer is case-insensitive, but this setter is case-sensitive.
        expected.orientation=effect.orientation==='horizontal'?'horizontal':'vertical';break;
      case 'setDiagramTitle':expected.title=use(effect.recordIndex,'title');finalFields.set('title',effect.recordIndex);break;
      case 'setAccTitle':expected.accTitle=use(effect.recordIndex,'accTitle');break;
      case 'setAccDescription':expected.accDescr=use(effect.recordIndex,'accDescr');break;
      case 'setXAxisTitle':data.xAxis.title=use(effect.recordIndex,'xTitle');finalFields.set('xTitle',effect.recordIndex);break;
      case 'setYAxisTitle':data.yAxis.title=use(effect.recordIndex,'yTitle');finalFields.set('yTitle',effect.recordIndex);break;
      case 'setXAxisBand':
        data.xAxis={type:'band',title:data.xAxis.title,categories:effect.records.map((id,index)=>use(id,'category',undefined,index))};
        categoryOwners=[...effect.records];hasX=true;break;
      case 'setXAxisRangeData':
        data.xAxis={type:'linear',title:data.xAxis.title,min:finite(effect.min),max:finite(effect.max)};
        categoryOwners=[];hasX=true;break;
      case 'setYAxisRangeData':
        data.yAxis={type:'linear',title:data.yAxis.title,min:finite(effect.min),max:finite(effect.max)};hasY=true;break;
      case 'setLineData':case 'setBarData': {
        const index=data.plots.length;
        if(effect.seriesIndex!==index) invalid('series identity differs');
        const title=use(effect.recordIndex,'seriesTitle',index);
        const labels=effect.data.map((datum,member)=>use(datum.recordIndex,'pointLabel',index,member));
        const values=effect.data.map(datum=>finite(datum.value)),plotData=transform(values);
        const color=palette[index===0?0:index%palette.length];
        data.plots.push(effect.method==='setLineData'
          ? {type:'line',title,strokeFill:color,strokeWidth:2,data:plotData,...(labels.some(Boolean)?{pointLabels:labels}:{})}
          : {type:'bar',title,fill:color,data:plotData});
        plotOwners.push({title:effect.recordIndex,labels:effect.data.map(d=>d.recordIndex)});
        break;
      }
      default: invalid('unknown native effect');
    }
  }
  if(nextRecord!==math.records.length+1) invalid('unconsumed authored records');
  if(!isDeepStrictEqual(native,expected)) invalid('actual native axes, plot history, styles or metadata differ');
  const candidates:XYOwnedSlot[]=[];
  const add=(key:string,role:XYLabelRole,recordIndex:number,identity:{seriesIndex?:number;memberIndex?:number}={})=>{
    if(byId.get(recordIndex)?.dbValue) candidates.push(Object.freeze({key,role,recordIndex,...identity}));
  };
  for(const role of ['title','xTitle','yTitle'] as const) {
    const id=finalFields.get(role);if(id!==undefined)add(role,role,id);
  }
  // Native band getTickValues retains the category list, even when the scale
  // maps equal categories to the same position. Each authored copy keeps its owner.
  categoryOwners.forEach((id,memberIndex)=>add(`category:${memberIndex}`,'category',id,{memberIndex}));
  plotOwners.forEach((owner,seriesIndex)=>{
    add(`series:${seriesIndex}`,'seriesTitle',owner.title,{seriesIndex});
    const plot=data.plots[seriesIndex]!;
    if(plot.type==='line') owner.labels.slice(0,plot.data.length).forEach((id,memberIndex)=>add(`point:${seriesIndex}:${memberIndex}`,'pointLabel',id,{seriesIndex,memberIndex}));
  });
  // Actual visibility, scale validity and ink placement are checked by the
  // measured renderer. Missing numeric values remain undefined in this snapshot.
  return {snapshot:structuredClone(native),candidates:Object.freeze(candidates)};
}
