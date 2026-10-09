// Measured math path for the pinned journey renderer. Plain diagrams retain
// upstream drawing, supplied with the one captured read of its mutating DB.
import { measureMermaidLabel, type MeasuredMermaidLabel } from './mermaid-label.ts';
import { journeyDisplayTextReplacements, journeyMathTextReplacements } from '../../core/src/mermaid/journey-text.ts';
import { validateMermaidMathLabel } from '../../core/src/mermaid/math.ts';
import { EMPTY_MATH_RESOURCE_TOTAL, MATH_LIMITS } from '../../core/src/math/policy.ts';
import type { JourneyLabelRole } from '../../core/src/mermaid/journey-labels.ts';

type Task = { task: string; section: string; people: string[]; score: number };
type Db = { getTasks(): Task[]; getActors(): string[]; getDiagramTitle(): string };
type Diagram = { db: Db } & Record<string, unknown>;
type Draw = (text: string, id: string, version: string, diagram: Diagram) => void | Promise<void>;
type Label = { key: string; value: string; measured: MeasuredMermaidLabel };
export type JourneyMathDependencies = {
  original: Draw; getConfig(): any; select(element: Element): any;
  initGraphics(svg: any, id: string): void;
  drawFace(svg: any, data: { cx: number; cy: number; score: number }): void;
  drawCircle(svg: any, data: Record<string, unknown>): void;
  configureSvgSize(svg: any, height: number, width: number, useMaxWidth: boolean): void;
};
const SVG = 'http://www.w3.org/2000/svg';
const positive = (value: unknown, fallback: number) => { const n = Number.parseFloat(String(value)); return Number.isFinite(n) && n > 0 ? n : fallback; };
function edited(text: string, edits: readonly { start: number; end: number; text: string }[]): string {
  let result = '', cursor = 0;
  for (const edit of edits) { result += text.slice(cursor,edit.start) + edit.text; cursor = edit.end; }
  return result + text.slice(cursor);
}

export function createJourneyMathRenderer(deps: JourneyMathDependencies): Draw {
  return async (text,id,version,diagram) => {
    const nativeTasks = diagram.db.getTasks();
    const nativeActors = diagram.db.getActors();
    const title = diagram.db.getDiagramTitle();
    const proxy = {...diagram,db:{...diagram.db,getTasks:()=>nativeTasks,getActors:()=>nativeActors}};
    if (![title,...nativeTasks.flatMap(task => [task.task,task.section,...task.people])].some(value => value.includes('$$'))) {
      return deps.original(text,id,version,proxy);
    }
    const tasks = nativeTasks.map(task => ({...task,people:[...task.people]}));
    const actors = [...nativeActors];
    const sortedActors = [...actors].sort();
    if (actors.length !== new Set(actors).size || actors.some((name,index) => sortedActors[index] !== name)) throw new Error('Journey actor ordering changed');
    // Native assigns colors in sorted DB order, then Object.keys puts integer
    // actor names first in numeric order. Retain that visual order without
    // the native assignment bug that loses an authored __proto__ property.
    const actorIndices = new Map(actors.map((name,index)=>[name,index]));
    const legendIndices = Object.keys(Object.fromEntries(actors.map(name=>[name,true]))).map(name=>actorIndices.get(name)!);
    if (tasks.some(task => !Number.isFinite(task.score))) throw new Error('Journey math requires finite task scores');
    const svgNode = document.getElementById(id) as unknown as SVGSVGElement | null;
    if (!svgNode?.isConnected || svgNode.namespaceURI !== SVG) throw new Error('Journey SVG is unavailable');
    const svg = deps.select(svgNode), config = deps.getConfig(), conf = config.journey;
    const pad = 10, marginX = positive(conf.diagramMarginX,50), marginY = positive(conf.diagramMarginY,10);
    const taskGap = positive(conf.taskMargin,50), minWidth = positive(conf.width,150), minHeight = positive(conf.height,50);
    const runs: {start:number;count:number;text:string;color:number}[] = [];
    const taskColors: number[] = []; let previous = '', color = -1;
    for (const [index,task] of tasks.entries()) {
      if (task.section !== previous) {
        color++;
        let end = index + 1; while (end < tasks.length && tasks[end]!.section === task.section) end++;
        runs.push({start:index,count:end-index,text:task.section,color}); previous = task.section;
      }
      taskColors.push(color);
    }
    const fills: string[] = conf.sectionFills, colors: string[] = conf.sectionColours, actorColors: string[] = conf.actorColours;
    if (!fills?.length || !colors?.length || !actorColors?.length) throw new Error('Journey color configuration is empty');
    const fill = (color:number) => color < 0 ? '#CCC' : fills[color % fills.length]!;
    const ink = (color:number) => color < 0 ? 'black' : colors[color % colors.length]!;
    const labels = new Map<string,Label>();
    let total = EMPTY_MATH_RESOURCE_TOTAL;
    const measure = async (key:string,value:string,role:JourneyLabelRole,color?:string) => {
      const validation = edited(value,journeyMathTextReplacements(value,role));
      const displayed = edited(value,journeyDisplayTextReplacements(value,role));
      const checked = validateMermaidMathLabel(validation,total);
      const shown = validateMermaidMathLabel(displayed,total);
      if (JSON.stringify(checked.total) !== JSON.stringify(shown.total)) throw new Error('Journey display math differs from validation');
      total = shown.total;
      const probe = svgNode.ownerDocument.createElementNS(SVG,'svg');
      if (color) probe.style.fill = color;
      svgNode.append(probe);
      try {
        const options = role === 'title' ? {fontSize:`${positive(conf.titleFontSize,20)}px`,fontFamily:conf.titleFontFamily,fontWeight:'bold'} :
          role === 'actor' ? {maxWidth:positive(conf.maxLabelWidth,360)} : {fontSize:`${positive(conf.taskFontSize,14)}px`,fontFamily:conf.taskFontFamily};
        labels.set(key,{key,value:displayed,measured:await measureMermaidLabel(probe,displayed,role === 'actor' ? 'legend' : role === 'title' ? '' : 'task',{
          ...options,interpretBreakTags:false,
        })});
      } finally { probe.remove(); }
    };
    if (title) await measure('title',title,'title',conf.titleColor);
    for (const [index,name] of actors.entries()) await measure(`actor:${index}`,name,'actor');
    for (const run of runs) await measure(`section:${run.start}`,run.text,'section',ink(run.color));
    for (const [index,task] of tasks.entries()) await measure(`task:${index}`,task.task,'task',ink(taskColors[index]!));
    const label = (key:string) => { const value=labels.get(key); if(!value) throw new Error(`Missing journey label ${key}`); return value; };
    const titleLabel = labels.get('title');
    const legendWidth = Math.max(0,...actors.map((_actor,index) => label(`actor:${index}`).measured.width));
    const left = Math.max(positive(conf.leftMargin,150),actors.length ? 40+legendWidth+marginX : marginX);
    const sectionY = Math.max(50,titleLabel ? 20+titleLabel.measured.height+20 : 50);
    const sectionHeight = runs.length ? Math.max(minHeight,...runs.map(run => label(`section:${run.start}`).measured.height+2*pad)) : 0;
    const taskY = sectionY+sectionHeight+20;
    const taskHeight = Math.max(minHeight,...tasks.map((_task,index) => label(`task:${index}`).measured.height+2*pad));
    const widths = tasks.map((task,index) => Math.max(minWidth,label(`task:${index}`).measured.width+2*pad,task.people.length ? 21+(task.people.length-1)*10+pad : 0));
    for (const run of runs) {
      const available = widths.slice(run.start,run.start+run.count).reduce((sum,width)=>sum+width,0)+taskGap*(run.count-1);
      const deficit = Math.max(0,label(`section:${run.start}`).measured.width+2*pad-available);
      for(let index=run.start;index<run.start+run.count;index++) widths[index]! += deficit/run.count;
    }
    const xs:number[]=[]; let right=left;
    for(const width of widths) { xs.push(right); right += width+taskGap; }
    if(widths.length) right -= taskGap;
    const offsets=tasks.map(task => (5-task.score)*30);
    const minOffset=Math.min(0,...offsets.map(offset=>offset-16));
    const maxOffset=Math.max(150,...offsets.map(offset=>offset+16));
    const axisY=taskY+taskHeight+25, scoreBase=axisY+40-minOffset;
    const legendYs:number[]=[]; let legendBottom=sectionY;
    for(const index of legendIndices) {legendYs[index]=legendBottom;legendBottom+=Math.max(20,label(`actor:${index}`).measured.height)+20;}
    const width=Math.max(right,titleLabel ? left+titleLabel.measured.width : left,40+legendWidth)+marginX;
    const height=Math.max(legendBottom,tasks.length ? scoreBase+maxOffset : sectionY+sectionHeight)+marginY;
    const dimensionLimit=MATH_LIMITS.maxDimensionEm*positive(config.fontSize,16);
    if (![width,height,scoreBase].every(Number.isFinite) || width<=0 || height<=0 || Math.max(width,height)>dimensionLimit) throw new Error('Journey math geometry exceeds its dimension limit');
    // No permanent DOM changes until every label and complete layout passes.
    const attributes=[...svgNode.attributes].map(attribute=>[attribute.name,attribute.value] as const);
    const group=svg.append('g').attr('class','vs-journey-math');
    try {
      deps.initGraphics(group,id);
      const place=(key:string,parent:any,x:number,y:number) => label(key).measured.place(parent.node(),x,y).setAttribute('data-vs-mermaid-label',key);
      if(titleLabel) place('title',group,left,20);
      const actorMap=new Map(actors.map((name,index)=>[name,{position:index,color:actorColors[index%actorColors.length]}]));
      legendIndices.forEach(index=>{
        const name=actors[index]!;
        const measured=label(`actor:${index}`).measured,y=legendYs[index]!;
        deps.drawCircle(group,{cx:20,cy:y+measured.height/2,r:7,fill:actorMap.get(name)!.color,stroke:'#000',pos:index});
        place(`actor:${index}`,group,40,y);
      });
      const box=(parent:any,x:number,y:number,w:number,h:number,className:string,color:number)=>parent.append('rect').attr('x',x).attr('y',y).attr('width',w).attr('height',h).attr('rx',3).attr('ry',3).attr('class',className).attr('fill',fill(color));
      for(const run of runs) {
        const node=group.append('g').attr('class','journey-section-wrapper'),x=xs[run.start]!,end=run.start+run.count-1;
        const w=xs[end]!+widths[end]!-x,m=label(`section:${run.start}`).measured;
        box(node,x,sectionY,w,sectionHeight,`journey-section section-type-${run.color%fills.length}`,run.color);
        place(`section:${run.start}`,node,x+(w-m.width)/2,sectionY+(sectionHeight-m.height)/2);
      }
      tasks.forEach((task,index)=>{
        const node=group.append('g').attr('class','journey-task-wrapper'),x=xs[index]!,w=widths[index]!,center=x+w/2,faceY=scoreBase+offsets[index]!;
        node.append('line').attr('id',`${id}-task${index}`).attr('x1',center).attr('x2',center).attr('y1',taskY).attr('y2',Math.max(scoreBase+150,faceY)).attr('class','task-line').attr('stroke','#666').attr('stroke-width',1).attr('stroke-dasharray','4 2');
        deps.drawFace(node,{cx:center,cy:faceY,score:task.score});
        const color=taskColors[index]!,m=label(`task:${index}`).measured;
        box(node,x,taskY,w,taskHeight,`task task-type-${Math.max(0,color)%fills.length}`,color);
        task.people.forEach((name,person)=>{
          const actor=actorMap.get(name); if(!actor) throw new Error('Journey task has an unowned actor');
          deps.drawCircle(node,{cx:x+14+person*10,cy:taskY,r:7,fill:actor.color,stroke:'#000',title:name,pos:actor.position});
        });
        place(`task:${index}`,node,x+(w-m.width)/2,taskY+(taskHeight-m.height)/2);
      });
      if(tasks.length) group.append('line').attr('class','journey-axis').attr('x1',left).attr('x2',right).attr('y1',axisY).attr('y2',axisY).attr('stroke','black').attr('stroke-width',4).attr('marker-end',`url(#${id}-arrowhead)`);
      deps.configureSvgSize(svg,height,width,conf.useMaxWidth);
      svg.attr('viewBox',`0 0 ${width} ${height}`).attr('preserveAspectRatio','xMinYMin meet');
    } catch(error) {
      group.remove(); for(const attribute of [...svgNode.attributes]) svgNode.removeAttribute(attribute.name);
      for(const [name,value] of attributes) svgNode.setAttribute(name,value);
      throw error;
    }
  };
}
