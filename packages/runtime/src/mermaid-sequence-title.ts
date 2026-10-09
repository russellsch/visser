import { measureMermaidLabel, type MeasuredMermaidLabel, type MermaidLabelMeasureOptions } from './mermaid-label.ts';
import { sequenceSanitizedMathText } from '../../core/src/mermaid/sequence-text.ts';

type Box = {name?: string; wrap?: boolean; margin?: number; x?: number; y?: number; width?: number; textMaxHeight?: number};
type Actor = {box?: Box; width?: number; margin?: number};
type Config = {width: number; wrapPadding: number; actorMargin: number; boxTextMargin: number;
  actorFontFamily?: string; actorFontSize?: string|number; actorFontWeight?: string|number};
type BoxBinding = {svg: SVGSVGElement; key: string; text: string; label: MeasuredMermaidLabel;
  options: MermaidLabelMeasureOptions; runs: Actor[][]; snapshots: Box[]; placed: Map<string,SVGElement>};
type TitleBinding = {text: string; label: MeasuredMermaidLabel; placed?: SVGElement};
const boxes = new WeakMap<Box,BoxBinding>();
const snapshots = new WeakMap<Box,{binding: BoxBinding; key: string}>();
const pending = new WeakSet<Box>();
const titles = new WeakMap<SVGSVGElement,TitleBinding>();
const pendingSvg = new WeakSet<SVGSVGElement>();

export async function prepareSequenceTitles(svg: SVGSVGElement, title: string, input: readonly Box[], actors: Map<string,Actor>,
  actorKeys: readonly string[], conf: Config) {
  const owned: Box[]=[];
  if(pendingSvg.has(svg))throw new Error('Sequence titles are already being rendered');
  pendingSvg.add(svg);
  const dispose=(success=false)=>{
    if(!success)titles.get(svg)?.placed?.remove();
    titles.delete(svg);pendingSvg.delete(svg);
    for(const box of owned){const b=boxes.get(box);if(b){if(!success)for(const node of b.placed.values())node.remove();for(const model of b.snapshots)snapshots.delete(model);}boxes.delete(box);pending.delete(box);}
  };
  try {
    for(const box of input){if(typeof box.name!=='string'||!box.name.includes('$$'))continue;if(pending.has(box))throw new Error('Sequence box is already being rendered');pending.add(box);owned.push(box);}
    for(const box of owned){
      const text=box.name;
      if(typeof text!=='string')throw new Error('Sequence box title changed during preparation');
      const options: MermaidLabelMeasureOptions={
        ...(conf.actorFontFamily?{fontFamily:conf.actorFontFamily}:{}),
        ...(conf.actorFontSize?{fontSize:typeof conf.actorFontSize==='number'?`${conf.actorFontSize}px`:conf.actorFontSize}:{}),
        ...(conf.actorFontWeight?{fontWeight:String(conf.actorFontWeight)}:{}),
      };
      const runs: Actor[][]=[];
      let current: Actor[]|undefined;
      for(const id of actorKeys){const actor=actors.get(id);if(!actor)throw new Error('Sequence box has a missing actor');if(actor.box===box){if(!current){current=[];runs.push(current);}current.push(actor);}else current=undefined;}
      const label=await measureMermaidLabel(svg,sequenceSanitizedMathText(text),'text',{...options,...(box.wrap?{maxWidth:conf.width-2*conf.wrapPadding}:{})});
      boxes.set(box,{svg,key:`box:${input.indexOf(box)}`,text,label,options,runs,snapshots:[],placed:new Map()});
    }
    if(title.includes('$$'))titles.set(svg,{text:title,label:await measureMermaidLabel(svg,sequenceSanitizedMathText(title),'')});
    return {dispose,assertComplete(){
      const titleBinding=titles.get(svg);
      if(titleBinding&&(!titleBinding.placed||!svg.contains(titleBinding.placed)||titleBinding.placed.getAttribute('data-vs-mermaid-label')!=='title'))throw new Error('Sequence title math is missing');
      for(const box of owned){const b=boxes.get(box)!;if(b.snapshots.length!==b.runs.length||b.placed.size!==b.runs.length||[...b.placed].some(([key,node])=>!svg.contains(node)||node.getAttribute('data-vs-mermaid-label')!==key))throw new Error('Sequence box math copies are missing');}
    }};
  }catch(error){dispose();throw error;}
}
function minRunWidth(b: BoxBinding, conf: Config): number {
  if(!b.runs.length)return conf.width;
  const widths=b.runs.map(run=>run.reduce((sum,actor,index)=>sum+Math.max(actor.width??conf.width,conf.width)+(index?run[index-1]!.margin||conf.actorMargin:0),0));
  if(widths.some(width=>!Number.isFinite(width)||width<=0))throw new Error('Invalid sequence box actor width');
  return Math.min(...widths);
}
export async function finalizeSequenceBox(box: Box, conf: Config) {
  const b=boxes.get(box);if(!b)return;
  if(box.name!==b.text)throw new Error('Sequence box text changed before layout');
  if(box.wrap)b.label=await measureMermaidLabel(b.svg,sequenceSanitizedMathText(b.text),'text',{...b.options,maxWidth:Math.max(1,minRunWidth(b,conf)+2*conf.boxTextMargin-2*conf.wrapPadding)});
}
export const sequenceBoxDimensions=(box: Box)=>{const label=boxes.get(box)?.label;return label&&{width:label.width,height:label.height};};
export function reserveSequenceBoxMargin(box: Box, conf: Config) {
  const b=boxes.get(box);if(!b)return;
  box.margin=Math.max(box.margin??0,(b.label.width+2*conf.wrapPadding-minRunWidth(b,conf))/2);
}
/** Native addBox retains a mutable object; snapshot each math run before the next run changes it. */
export function sequenceBoxSnapshot(box: Box): Box {
  const b=boxes.get(box);if(!b)return box;
  const index=b.snapshots.length;
  if(index>=b.runs.length)throw new Error('Unexpected sequence box run');
  const model={...box};
  b.snapshots.push(model);snapshots.set(model,{binding:b,key:`${b.key}:run:${index}`});
  return model;
}
export function drawSequenceBox(box: Box, selection: {node(): SVGElement}, conf: Config): boolean {
  const snapshot=snapshots.get(box);if(!snapshot)return false;
  const {binding:b,key}=snapshot;const parent=selection.node();
  if(b.placed.has(key)||!b.svg.contains(parent)||box.name!==b.text||![box.x,box.y,box.width].every(Number.isFinite)||box.width!<b.label.width)throw new Error('Invalid sequence box math placement');
  const node=b.label.place(parent,box.x!+(box.width!-b.label.width)/2,box.y!+conf.boxTextMargin);
  node.setAttribute('data-vs-mermaid-label',key);b.placed.set(key,node);return true;
}
export const hasSequenceTitle=(svg: SVGSVGElement): boolean=>titles.has(svg);

/** Expand the final native rectangle; title placement never assumes x starts at zero. */
export function finalizeSequenceTitle(svg: SVGSVGElement, text: string, padding: number): {width:number;height:number}|undefined {
  const b=titles.get(svg);if(!b)return;
  if(b.placed||text!==b.text||!Number.isFinite(padding)||padding<0)throw new Error('Invalid sequence title finalization');
  const native=svg.viewBox.baseVal;
  const {x,y,width,height}=native;
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)throw new Error('Invalid sequence title viewport');
  const gap=Math.max(10,padding);
  const center=x+width/2;
  const titleTop=y-gap-b.label.height;
  const left=Math.min(x,center-b.label.width/2-padding);
  const right=Math.max(x+width,center+b.label.width/2+padding);
  const top=titleTop-padding;
  const bottom=y+height;
  const node=b.label.place(svg,center-b.label.width/2,titleTop);
  node.setAttribute('data-vs-mermaid-label','title');b.placed=node;
  svg.setAttribute('viewBox',`${left} ${top} ${right-left} ${bottom-top}`);
  return {width:right-left,height:bottom-top};
}
