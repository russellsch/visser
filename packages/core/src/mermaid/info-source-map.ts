import {createMermaidSourceDisplay,type MermaidSourceBody,type MermaidSourceExpression} from './math-source-display.ts';
import {assertMermaidSourceTransport} from './parse.ts';
import {reserveInfoTransportMath,type InfoRenderMath} from './info-transport.ts';
/** Info renders a fixed version string. An explicit empty map attests that no
 * generated formula is source-owned; hidden authored fields still authenticate
 * and reserve their costs before export. */
export function infoMathSourceMap(figure:MermaidSourceBody&{infoMath:InfoRenderMath},rawDocument:Uint8Array){
 const display=createMermaidSourceDisplay(figure,rawDocument);
 assertMermaidSourceTransport('info',figure.source,display.original,figure.infoMath);
 reserveInfoTransportMath(figure.infoMath);
 const labels:ReadonlyArray<Readonly<{key:string;expressions:readonly MermaidSourceExpression[]}>>=Object.freeze([]);
 return Object.freeze({format:'info' as const,source:display.source,labels});
}
