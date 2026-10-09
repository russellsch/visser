import {expect,it} from 'vitest';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
import {tagERLayoutOwners} from '../../packages/core/src/mermaid/er-layout-owners.ts';
import {planERLabelSlots} from '../../packages/core/src/mermaid/er-slot-plan.ts';

const labels=()=>({parserSource:'A',records:[{
 recordIndex:0,role:'entity.name' as const,mappedValue:ProvenanceText.identity('A'),semanticValue:'A',intervals:[],synthetic:false,
}],effects:[]});
const normalized=()=>({effects:[],fields:[]});
const owners=()=>({records:labels().records,entities:[{
 entityIndex:0,entityKey:'A',nativeId:'a',nameRecord:0,header:{kind:'record' as const,recordIndex:0},headerPath:'simple' as const,rows:[],suppressedByGroup:false,
}],relationships:[],groups:[],displayGroupOrder:[],displayEntityOrder:[0]});
const tagged=()=>tagERLayoutOwners({nodes:[{id:'a',isGroup:false,shape:'erBox',label:'A',alias:'',attributes:[]}],edges:[]},[{kind:'entity',index:0}],[]);
const observed=(value:ReturnType<typeof tagged>)=>({nodes:[{
 graphPath:[],id:'a',route:'node' as const,owner:{kind:'entity' as const,index:0},token:value.registry[0]!.token,label:'A',alias:'',shape:'erBox',missing:false,
}],edges:[]});

it('joins ELK source provenance to native slots in slot order',()=>{
 const result=planERLabelSlots(labels(),normalized(),owners(),tagged(),{kind:'elk'});
 expect(result).toHaveLength(1);
 expect(result[0]).toMatchObject({key:'node:0:header:retained:single',token:'node:0',scalar:{kind:'node',ordinal:0,field:'header'},lifetime:'retained'});
 expect(result[0]!.value.text).toBe('A');
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result[0]!)).toBe(true);
});

it('fails closed when a Dagre source plan names a token outside the tagged registry',()=>{
 const value=tagged(),seen=observed(value);
 seen.nodes[0]!.token='node:9';
 expect(()=>planERLabelSlots(labels(),normalized(),owners(),value,{kind:'dagre',observed:seen as never})).toThrow(/registry|original native item/);
});

it('does not replace source provenance with a forged native label',()=>{
 const value=tagged();
 value.data.nodes[0]!.label='forged';
 expect(()=>planERLabelSlots(labels(),normalized(),owners(),value,{kind:'elk'})).toThrow(/native fields differ/);
});
