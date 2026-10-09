import { measureMermaidLabel, type MeasuredMermaidLabel, type MermaidLabelMeasureOptions } from './mermaid-label.ts';

type Message = {id?: string; message?: unknown; type?: number; wrap?: boolean; from?: string; to?: string};
type Model = {message: string; startx: number; stopx: number; starty: number; stopy: number; height: number; width: number; fromBounds: number; toBounds: number};
type Config = {width: number; wrapPadding: number; boxMargin: number; rightAngles?: boolean;
  messageFontFamily?: string; messageFontSize?: string|number; messageFontWeight?: string|number};
type Bounds = {getVerticalPos(): number; bumpVerticalPos(amount: number): void; insert(left: number,top: number,right: number,bottom: number): void};
type Binding = {svg: SVGSVGElement; key: string; text: string; label: MeasuredMermaidLabel; options: MermaidLabelMeasureOptions; width?: number; model?: Model; placed?: SVGElement};
const messages = new WeakMap<Message,Binding>();
const models = new WeakMap<Model,Binding>();
const pending = new WeakSet<Message>();
// Exact accepted LINETYPE values in the fingerprinted buildMessageModel.
const arrowTypes = new Set([0,1,3,4,5,6,24,25,33,34,41,42,43,44,45,46,47,48,51,52,53,54,55,56,57,58]);
// Native self curves reach 10px above the line; the largest arrow marker and
// sequence-number glyph remain within this clearance, including their stroke.
const GAP = 16;
export const isSequenceArrow = (msg: Message): boolean => typeof msg.type === 'number' && arrowTypes.has(msg.type);
export const sequenceMessageDimensions = (object: Message | Model) => {
  const binding = messages.get(object as Message) ?? models.get(object as Model);
  return binding && {width:binding.label.width,height:binding.label.height};
};

export async function prepareSequenceMessages(svg: SVGSVGElement, input: readonly Message[], conf: Config) {
  const owned: Message[]=[];
  const dispose=(success=false)=>{for(const msg of owned){const binding=messages.get(msg);if(!success)binding?.placed?.remove();if(binding?.model)models.delete(binding.model);messages.delete(msg);pending.delete(msg);}};
  try {
    const entries=input.map((msg,index)=>({msg,index})).filter(({msg})=>isSequenceArrow(msg)&&typeof msg.message==='string'&&msg.message.includes('$$'));
    for(const {msg,index} of entries){if(msg.id!==String(index))throw new Error('Sequence message has no original DB identity');if(pending.has(msg))throw new Error('Sequence message is already being rendered');pending.add(msg);owned.push(msg);}
    for(const {msg,index} of entries){
      const options: MermaidLabelMeasureOptions={
        ...(conf.messageFontFamily?{fontFamily:conf.messageFontFamily}:{}),
        ...(conf.messageFontSize?{fontSize:typeof conf.messageFontSize==='number'?`${conf.messageFontSize}px`:conf.messageFontSize}:{}),
        ...(conf.messageFontWeight?{fontWeight:String(conf.messageFontWeight)}:{}),
      };
      const width=msg.wrap?conf.width-2*conf.wrapPadding:undefined;
      const text=msg.message as string;
      const label=await measureMermaidLabel(svg,text,'messageText',{...options,...(width!==undefined?{maxWidth:width}:{})});
      messages.set(msg,{svg,key:`message:${index}`,text,label,options,...(width!==undefined?{width}:{})});
    }
    return {dispose,assertComplete(){for(const msg of owned){const b=messages.get(msg)!;if(!b.placed||!svg.contains(b.placed)||b.placed.getAttribute('data-vs-mermaid-label')!==b.key)throw new Error('Sequence message math copies are missing');}}};
  }catch(error){dispose();throw error;}
}

export async function finalizeSequenceMessage(msg: Message, availableWidth: number) {
  const b=messages.get(msg);
  if(!b)return;
  if(msg.message!==b.text)throw new Error('Sequence message changed before layout');
  if(msg.wrap&&b.width!==availableWidth){
    b.label=await measureMermaidLabel(b.svg,b.text,'messageText',{...b.options,maxWidth:availableWidth});
    b.width=availableWidth;
  }
}
export function bindSequenceMessage(msg: Message, model: Model): Model {
  const b=messages.get(msg);
  if(b){if(b.model)throw new Error('Sequence message model was assigned twice');b.model=model;models.set(model,b);}
  return model;
}
export function reserveSequenceMessageBounds(model: Model, lineY: number, bounds: Bounds, conf: Config) {
  const b=models.get(model);
  if(!b)return;
  const {width,height}=b.label;
  const center=(model.startx+model.stopx)/2;
  if(![center,lineY,width,height].every(Number.isFinite))throw new Error('Invalid sequence message geometry');
  bounds.insert(center-width/2,lineY-GAP-height,center+width/2,lineY);
  if(model.startx===model.stopx){
    const excursion=conf.rightAngles?Math.max(conf.width/2,width/2):60;
    bounds.insert(model.startx,lineY-10,model.startx+excursion+10,lineY+30);
  }
}
export function boundSequenceMessage(model: Model, bounds: Bounds, conf: Config): number|undefined {
  const b=models.get(model);
  if(!b)return;
  const top=bounds.getVerticalPos()+Math.max(10,conf.boxMargin);
  const lineY=top+b.label.height+GAP;
  const bottom=lineY+(model.startx===model.stopx?30:0);
  bounds.bumpVerticalPos(bottom-bounds.getVerticalPos());
  model.height=bottom-model.starty;
  model.stopy=bottom;
  bounds.insert(model.fromBounds,model.starty,model.toBounds,bottom);
  reserveSequenceMessageBounds(model,lineY,bounds,conf);
  return lineY;
}
export function drawSequenceMessage(model: Model, selection: {node(): SVGElement}, lineY: number): boolean {
  const b=models.get(model);
  if(!b)return false;
  const parent=selection.node();
  if(b.placed||model.message!==b.text||(parent!==b.svg&&!b.svg.contains(parent)))throw new Error('Sequence message math ownership changed during rendering');
  const node=b.label.place(parent,(model.startx+model.stopx-b.label.width)/2,lineY-GAP-b.label.height);
  node.setAttribute('data-vs-mermaid-label',b.key);
  b.placed=node;
  return true;
}
