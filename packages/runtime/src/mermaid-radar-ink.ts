export type RadarInk=Readonly<{left:number;top:number;right:number;bottom:number}>;
const numberPattern=/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g;

/** Conservative convex-hull bounds for the pinned native M (C)+ Z path.
 * Inspect every serialized control point: SVG getBBox can silently ignore an
 * invalid segment, and endpoint-only bounds miss cardinal-spline overshoot.
 */
export function radarCurveInk(path:string,padding=0):RadarInk{
 const tokens=path.match(/[MCZ]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g)??[];
 if(tokens.join('')!==path.replace(/[\s,]/g,'')||tokens.shift()!=='M'||tokens.pop()!=='Z')throw new Error('Invalid Radar native curve syntax');
 const points:number[]=[];
 const take=(count:number)=>{for(let i=0;i<count;i++){const token=tokens.shift();if(token===undefined||['M','C','Z'].includes(token))throw new Error('Incomplete Radar native curve');const value=Number(token);if(!Number.isFinite(value))throw new Error('Nonfinite Radar curve geometry');points.push(value);}};
 take(2);let curves=0;
 while(tokens.length){if(tokens.shift()!=='C')throw new Error('Unexpected Radar path command');take(6);curves++;}
 if(!curves)throw new Error('Radar native curve has no segments');
 return radarPointInk(points,padding);
}

export function radarPolygonInk(points:string,padding=0):RadarInk{
 const tokens=points.match(numberPattern)??[];
 if(tokens.join('')!==points.replace(/[\s,]/g,''))throw new Error('Invalid Radar polygon syntax');
 return radarPointInk(tokens.map(Number),padding);
}

export function radarPointInk(points:readonly number[],padding=0):RadarInk{
 if(points.length<2||points.length%2!==0||!points.every(Number.isFinite)||!Number.isFinite(padding)||padding<0)throw new Error('Invalid Radar ink geometry');
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(let i=0;i<points.length;i+=2){left=Math.min(left,points[i]!);right=Math.max(right,points[i]!);top=Math.min(top,points[i+1]!);bottom=Math.max(bottom,points[i+1]!);}
 const ink={left:left-padding,top:top-padding,right:right+padding,bottom:bottom+padding};
 if(!Object.values(ink).every(Number.isFinite))throw new Error('Radar ink overflow');return ink;
}
