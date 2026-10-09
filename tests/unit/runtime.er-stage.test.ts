// @ts-expect-error jsdom has no declarations in this repository.
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {erNativeGraph,erPreparedLayout,type ERRuntimeGraph} from '../../packages/runtime/src/mermaid-er-context.ts';
import {withERRenderStage} from '../../packages/runtime/src/mermaid-er-stage.ts';

const graph=():ERRuntimeGraph=>({type:'er',layoutAlgorithm:'elk',nodes:[],edges:[]});
const setup=()=>{
 const dom=new JSDOM('<svg xmlns="http://www.w3.org/2000/svg" id="visible" class="before"><defs id="preserved"/><circle id="old-drawing"/></svg>');
 return {dom,root:dom.window.document.querySelector('svg')!};
};
const renderEmpty=async(stage:SVGSVGElement)=>{
 const data=graph();erNativeGraph(stage,data);await erPreparedLayout(stage,data,{});
 stage.setAttribute('viewBox','0 0 40 20');stage.setAttribute('width','40');
 const content=stage.querySelector('g')!;
 const path=stage.ownerDocument.createElementNS(stage.namespaceURI,'path');path.setAttribute('id','rendered');content.append(path);
 return 17;
};
const original=(root:SVGSVGElement)=>({attrs:[...root.attributes].map(attr=>[attr.name,attr.value]),html:root.innerHTML});

it('commits a completed empty ELK stage, preserving definitions and removing the private stage',async()=>{
 const {dom,root}=setup();
 try{
  await expect(withERRenderStage(root,input=>input,renderEmpty)).resolves.toBe(17);
  expect(root.getAttribute('viewBox')).toBe('0 0 40 20');expect(root.getAttribute('width')).toBe('40');
  expect(root.querySelector('#preserved')).not.toBeNull();expect(root.querySelector('#rendered')).not.toBeNull();
  expect(root.querySelector('[data-vs-er-stage]')).toBeNull();
  expect(root.querySelector('#old-drawing')).toBeNull();
  await withERRenderStage(root,input=>input,renderEmpty);
  expect(root.querySelectorAll('#rendered')).toHaveLength(1);expect(root.querySelectorAll('#preserved')).toHaveLength(1);
 }finally{dom.window.close();}
});

it('rolls back visible attributes and children after thrown, caught-invalid, or missing native boundaries',async()=>{
 const {dom,root}=setup();
 try{
  const cases:Array<(stage:SVGSVGElement)=>Promise<unknown>>=[
   async stage=>{stage.setAttribute('width','99');stage.querySelector('g')!.append('changed');throw new Error('draw failed');},
   async stage=>{const data=graph();try{await erPreparedLayout(stage,data,{})}catch{};stage.setAttribute('width','99');},
   async stage=>{stage.setAttribute('width','99');},
  ];
  for(const draw of cases){
   const before=original(root);
   await expect(withERRenderStage(root,input=>input,draw)).rejects.toThrow();
   expect(original(root)).toEqual(before);expect(root.querySelector('[data-vs-er-stage]')).toBeNull();
  }
 }finally{dom.window.close();}
});

it('rejects a detached stage, cleans it up, and permits a later successful retry',async()=>{
 const {dom,root}=setup();
 try{
  const before=original(root);
  await expect(withERRenderStage(root,input=>input,async stage=>{
   stage.remove();const data=graph();erNativeGraph(stage,data);await erPreparedLayout(stage,data,{});
  })).rejects.toThrow();
  expect(original(root)).toEqual(before);expect(root.querySelector('[data-vs-er-stage]')).toBeNull();
  await expect(withERRenderStage(root,input=>input,renderEmpty)).resolves.toBe(17);
  expect(root.querySelector('#rendered')).not.toBeNull();
 }finally{dom.window.close();}
});
