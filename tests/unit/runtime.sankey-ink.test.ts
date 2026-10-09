import {expect,it} from 'vitest';
import {sankeyCubicInk} from '../../packages/runtime/src/mermaid-sankey-ink.ts';

it('bounds every sampled native cubic point and its full stroke padding',()=>{
 const path='M10.125,20 C40,100,90,-30,150.875,50',stroke=3.5,ink=sankeyCubicInk(path,stroke);
 const points:[[number,number],[number,number],[number,number],[number,number]]=[[10.125,20],[40,100],[90,-30],[150.875,50]];
 const cubic=(t:number)=>{const q=1-t,weights=[q*q*q,3*q*q*t,3*q*t*t,t*t*t];return [points.reduce((sum,point,index)=>sum+point[0]*weights[index]!,0),points.reduce((sum,point,index)=>sum+point[1]*weights[index]!,0)] as const;};
 for(let index=0;index<=100;index++){const [x,y]=cubic(index/100);expect(x).toBeGreaterThanOrEqual(ink.left+stroke);expect(x).toBeLessThanOrEqual(ink.right-stroke);expect(y).toBeGreaterThanOrEqual(ink.top+stroke);expect(y).toBeLessThanOrEqual(ink.bottom-stroke);}
 expect(ink).toEqual({left:6.625,top:-33.5,right:154.375,bottom:103.5});
});

it('accepts native numeric spelling but rejects nonfinite stroke and unsupported path forms',()=>{
 expect(sankeyCubicInk(' M .5 1e1 C +2,-3 4. 5 6,7 ',0)).toEqual({left:.5,top:-3,right:6,bottom:10});
 for(const [path,stroke] of [
  ['m0,0C1,1,2,2,3,3',1],['M0,0c1,1,2,2,3,3',1],['M0,0C1,1,2,2,3,3L4,4',1],['M0,0C1,1,2,2,3,3 M4,4C5,5,6,6,7,7',1],['M0,0C1,1,2,2,NaN,3',1],['M0,0C1,1,2,2,3,3',NaN],['M0,0C1,1,2,2,3,3',-1],
 ] as Array<[string,number]>)expect(()=>sankeyCubicInk(path,stroke)).toThrow(/Sankey/);
});
