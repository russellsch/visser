import {expect,it} from 'vitest';
import {tagERLayoutOwners} from '../../packages/core/src/mermaid/er-layout-owners.ts';
import {enumerateERDagreSlots,enumerateERElkSlots} from '../../packages/core/src/mermaid/er-slots.ts';

const data=()=>({nodes:[
 {id:'g',isGroup:true,shape:'rect',label:''},
 {id:'a',isGroup:false,shape:'erBox',label:'Name',alias:'Alias',look:'handDrawn',attributes:[{type:'string',name:'field',keys:['PK','FK'],comment:'note'}]},
 {id:'b',isGroup:false,shape:'erBox',label:'B',alias:'',attributes:[]},
],edges:[{id:'e',label:'one<BR />two'}]});
const tagged=()=>tagERLayoutOwners(data(),[{kind:'group',index:2},{kind:'entity',index:3},{kind:'entity',index:4}],[{kind:'relationship',index:5}]);
const observed=(value:ReturnType<typeof tagged>)=>({
 nodes:[
  {graphPath:[],id:'g',route:'node' as const,owner:{kind:'group' as const,index:2},token:value.registry[0]!.token,label:'',missing:false},
  {graphPath:[],id:'a',route:'node' as const,owner:{kind:'entity' as const,index:3},token:value.registry[1]!.token,label:'Name',alias:'Alias',shape:'erBox',look:'handDrawn',missing:false},
  {graphPath:['g'],id:'b',route:'cluster' as const,owner:{kind:'entity' as const,index:4},token:value.registry[2]!.token,label:'B',isGroup:false,missing:false},
 ],
 edges:[{graphPath:[],v:'a',w:'b',owner:{kind:'relationship' as const,index:5},token:value.registry[3]!.token,label:'one<BR />two'}],
});

it('enumerates ELK original ordinal slots, including empty retained group titles and rough copies',()=>{
 const slots=enumerateERElkSlots(tagged());
 expect(slots.map(slot=>[slot.key,slot.input,slot.path])).toEqual([
  ['node:0:title:retained:single','','group-cluster'],
  ['node:1:header:retained:background','Alias','table'],['node:1:header:retained:foreground','Alias','table'],
  ['node:1:row:0:type:retained:background','string','table'],['node:1:row:0:type:retained:foreground','string','table'],
  ['node:1:row:0:name:retained:background','field','table'],['node:1:row:0:name:retained:foreground','field','table'],
  ['node:1:row:0:keys:retained:background','PK,FK','table'],['node:1:row:0:keys:retained:foreground','PK,FK','table'],
  ['node:1:row:0:comment:retained:background','note','table'],['node:1:row:0:comment:retained:foreground','note','table'],
  ['node:2:header:retained:single','B','simple-header'],['edge:0:role:retained:single','one\ntwo','edge'],
 ]);
 expect(slots.find(slot=>slot.field==='row:0:keys')!.scalar).toEqual({kind:'attribute',ordinal:1,row:0,field:'keys'});
});

it('enumerates Dagre winners from original tagged scalars and preserves raw clusters',()=>{
 const value=tagged(),slots=enumerateERDagreSlots(value,observed(value));
 expect(slots.map(slot=>[slot.key,slot.input,slot.path])).toEqual([
  ['node:0:title:single','','group-node'],
  ['node:1:header:background','Alias','table'],['node:1:header:foreground','Alias','table'],
  ['node:1:row:0:type:background','string','table'],['node:1:row:0:type:foreground','string','table'],
  ['node:1:row:0:name:background','field','table'],['node:1:row:0:name:foreground','field','table'],
  ['node:1:row:0:keys:background','PK,FK','table'],['node:1:row:0:keys:foreground','PK,FK','table'],
  ['node:1:row:0:comment:background','note','table'],['node:1:row:0:comment:foreground','note','table'],
  ['node:2:name:single','B','raw-cluster'],['edge:0:role:single','one<BR />two','edge'],
 ]);
});

it('rejects malformed identities, nonempty unowned labels, duplicate winners, and malformed native input',()=>{
 const value=tagged(),seen=observed(value);
 expect(()=>enumerateERDagreSlots(value,{...seen,nodes:[{...seen.nodes[0]!,token:'node:01'}]} as never)).toThrow(/malformed/);
 expect(()=>enumerateERDagreSlots(value,{...seen,nodes:[{graphPath:[],id:'x',route:'node',label:'synthetic'}]} as never)).toThrow(/unowned/);
 expect(()=>enumerateERDagreSlots(value,{...seen,nodes:[seen.nodes[1]!,seen.nodes[1]!]} as never)).toThrow(/duplicate/);
 const malformed=tagged(); (malformed.data.nodes[1] as any).attributes[0].keys='PK';
 expect(()=>enumerateERElkSlots(malformed)).toThrow(/keys/);
});

it('skips outer self-loop segments while retaining an empty middle role',()=>{
 const value=tagERLayoutOwners({nodes:[],edges:[{id:'loop',label:''}]},[],[{kind:'relationship',index:0}]),edge=value.registry[0]!;
 const slots=enumerateERDagreSlots(value,{nodes:[],edges:[
  {graphPath:[],v:'a',w:'a',owner:edge.owner,token:edge.token,label:'',selfLoopOrder:0},
  {graphPath:[],v:'a',w:'a',owner:edge.owner,token:edge.token,label:'',selfLoopOrder:1},
  {graphPath:[],v:'a',w:'a',owner:edge.owner,token:edge.token,label:'',selfLoopOrder:2},
 ]} as never);
 expect(slots).toEqual([expect.objectContaining({key:'edge:0:role:single',input:''})]);
});
