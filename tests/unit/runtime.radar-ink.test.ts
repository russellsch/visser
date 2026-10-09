import {expect,it} from 'vitest';
import {radarCurveInk,radarPointInk,radarPolygonInk} from '../../packages/runtime/src/mermaid-radar-ink.ts';

it('uses every cubic control point, including overshoot, across a complete multi-segment native curve',()=>{
 const ink=radarCurveInk('M0,0 C20,140,80,-90,100,20 C130,180,-60,50,0,0 Z',3);
 expect(ink).toEqual({left:-63,top:-93,right:133,bottom:183});
 const cubic=(points:number[][],t:number)=>points.reduce((sum,point,index)=>sum+point[0]!*[Math.pow(1-t,3),3*(1-t)*(1-t)*t,3*(1-t)*t*t,t*t*t][index]!,0);
 for(const points of [[[0,0],[20,140],[80,-90],[100,20]],[[100,20],[130,180],[-60,50],[0,0]]])for(let step=0;step<=100;step++){
  const t=step/100,x=cubic(points.map(point=>[point[0]!]),t),y=cubic(points.map(point=>[point[1]!]),t);
  expect(x).toBeGreaterThanOrEqual(ink.left+3);expect(x).toBeLessThanOrEqual(ink.right-3);
  expect(y).toBeGreaterThanOrEqual(ink.top+3);expect(y).toBeLessThanOrEqual(ink.bottom-3);
 }
});

it('bounds native polygon and point ink with finite stroke padding',()=>{
 expect(radarPolygonInk('0,1 4,-3 10,8',2)).toEqual({left:-2,top:-5,right:12,bottom:10});
 expect(radarPointInk([-4,5,7,-8],.5)).toEqual({left:-4.5,top:-8.5,right:7.5,bottom:5.5});
});

it('rejects malformed path commands, incomplete segments, nonfinite values, and overflowing geometry',()=>{
 for(const [path,padding] of [
  ['M0,0Z',0],['M0,0 C1,2,3,4,5 Z',0],['M0,0 C1,2,3,4,5,6 Z nope',0],
  ['m0,0 C1,2,3,4,5,6 Z',0],['M0,0 c1,2,3,4,5,6 Z',0],['M0,0 C1,2,3,4,NaN,6 Z',0],
  ['M0,0 C1,2,3,4,5,6 Z',Infinity],
 ] as Array<[string,number]>)expect(()=>radarCurveInk(path,padding)).toThrow(/Radar/);
 for(const value of ['0,1 nope','0,Infinity',','])expect(()=>radarPolygonInk(value)).toThrow(/Radar/);
 for(const value of [[0], [0,Infinity]])expect(()=>radarPointInk(value,0)).toThrow(/Radar/);
 expect(radarPointInk([Number.MAX_VALUE,0],0).right).toBe(Number.MAX_VALUE);
 expect(()=>radarPointInk([Number.MAX_VALUE,0],Number.MAX_VALUE)).toThrow(/Radar/);
});
