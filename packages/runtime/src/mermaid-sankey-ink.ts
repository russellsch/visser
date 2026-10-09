import type { SankeyInk } from './mermaid-sankey-layout.ts';

/** Bound the actual serialized native M/C path, including D3 coordinate rounding.
 * The control-point hull contains every cubic point. A full stroke width also
 * contains square/round caps. Native paths have no interior segment joins.
 */
export function sankeyCubicInk(path:string,strokeWidth:number):SankeyInk {
 if(!Number.isFinite(strokeWidth)||strokeWidth<0)throw new Error('Invalid Sankey link stroke');
 const number='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
 const pair=`(${number})[ ,]+(${number})`;
 const match=new RegExp(`^\\s*M\\s*${pair}\\s*C\\s*${pair}[ ,]+${pair}[ ,]+${pair}\\s*$`).exec(path);
 if(!match)throw new Error('Unexpected Sankey cubic path');
 const values=match.slice(1).map(Number);
 if(!values.every(Number.isFinite))throw new Error('Invalid Sankey cubic coordinates');
 const xs=[values[0]!,values[2]!,values[4]!,values[6]!];
 const ys=[values[1]!,values[3]!,values[5]!,values[7]!];
 const ink={left:Math.min(...xs)-strokeWidth,top:Math.min(...ys)-strokeWidth,
  right:Math.max(...xs)+strokeWidth,bottom:Math.max(...ys)+strokeWidth};
 if(!Object.values(ink).every(Number.isFinite))throw new Error('Excessive Sankey cubic ink');
 return ink;
}
