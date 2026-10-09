import {createMermaidSourceDisplay,type MermaidSourceBody,type MermaidSourceExpression} from './math-source-display.ts';
import {assertMermaidSourceTransport} from './parse.ts';
import {reserveERTransportMath,type ERRenderMath} from './er-transport.ts';

export type ERSourceMap=Readonly<{format:'er';source:string;labels:readonly Readonly<{key:string;expressions:readonly MermaidSourceExpression[]}>[]}>;
export function erMathSourceMap(figure:MermaidSourceBody&{erMath:ERRenderMath},rawDocument:Uint8Array):ERSourceMap{
 const display=createMermaidSourceDisplay(figure,rawDocument);
 assertMermaidSourceTransport('er',figure.source,display.original,figure.erMath);
 reserveERTransportMath(figure.erMath);
 const labels=figure.erMath.slots.filter(slot=>slot.lifetime==='retained').map(slot=>Object.freeze({key:slot.key,expressions:Object.freeze(display.expressions(slot.parts))}));
 return Object.freeze({format:'er',source:display.source,labels:Object.freeze(labels)});
}
