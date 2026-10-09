import {expect,it} from 'vitest';
import {createERStagePlan} from '../../packages/runtime/src/mermaid-er-plan.ts';
import {ER_LAYOUT_OWNER} from '../../packages/core/src/mermaid/er-layout-owners.ts';
const make=async(label='$$x$$',withChild=false)=>{
 const data={type:'er',layoutAlgorithm:'elk',nodes:[{id:'g',isGroup:true,shape:'rect',label,padding:8},...(withChild?[{id:'child',parentId:'g',isGroup:false,shape:'erBox',label:'Plain',alias:'',attributes:[]}]:[])] as any[],edges:[]};
 const plan=createERStagePlan({}as Element,input=>input);plan.hooks.graph(data);await plan.hooks.prepare(data,{});
 const node=data.nodes[0];plan.hooks.field!({node,field:'title',path:'group-node',copy:'single',lifetime:'measurement',input:label});node.labelBBox={width:80,height:60};
 return {plan,node};
};
it('reserves empty math group space on the original tagged graph node before layout',async()=>{
 const {plan,node}=await make();expect(node[ER_LAYOUT_OWNER]).toBe('node:0');
 expect(()=>plan.hooks.measuredGroup!({...node},4)).toThrow(/unplanned/);
 plan.hooks.measuredGroup!(node,4);expect(node.width).toBe(88);expect(node.height).toBe(64);
 expect(()=>plan.hooks.measuredGroup!(node,4)).toThrow(/repeated/);
});
it('preserves larger reservations and leaves native plain or nonempty groups unchanged',async()=>{
 const larger=await make();larger.node.width=120;larger.node.height=100;larger.plan.hooks.measuredGroup!(larger.node,4);expect([larger.node.width,larger.node.height]).toEqual([120,100]);
 for(const [label,child]of [['Plain',false],['$$x$$',true]]as const){const {plan,node}=await make(label,child);plan.hooks.measuredGroup!(node,4);expect(node.width).toBeUndefined();expect(node.height).toBeUndefined();}
});
it('rejects a measurement before the planned field and invalid native dimensions',async()=>{
 const {plan,node}=await make();node.labelBBox.height=Number.NaN;
 expect(()=>plan.hooks.measuredGroup!(node,0)).toThrow(/dimensions/);
 const data={type:'er',layoutAlgorithm:'elk',nodes:[{id:'g',isGroup:true,shape:'rect',label:'$$x$$',padding:8}],edges:[]};
 const early=createERStagePlan({}as Element,input=>input);early.hooks.graph(data);await early.hooks.prepare(data,{});
 expect(()=>early.hooks.measuredGroup!(data.nodes[0],0)).toThrow(/unplanned/);
});
