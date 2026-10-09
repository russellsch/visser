import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {captureRadarDb,reconcileRadarDb,replayRadarDb,type RadarDbInput} from '../../packages/core/src/mermaid/radar-db.ts';

const original=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(original[key])Object.defineProperty(DOMPurify,key,original[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});return (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;}

const source=String.raw`radar-beta
axis dup["$$axis-one$$"],dup["$$axis-two$$"],bare
curve c["$$curve$$"]{dup: 1, bare: 2, dup: 3}
curve same {4,5,6}
curve same {7,8}
showLegend false,showLegend true,ticks 0,ticks 99,max 10,min 0,graticule polygon
`;
const input:RadarDbInput={
 axes:[{name:'dup',label:'$$axis-one$$'},{name:'dup',label:'$$axis-two$$'},{name:'bare'}],
 curves:[{name:'c',label:'$$curve$$',entries:[{axis:{$refText:'dup'},value:1},{axis:{$refText:'bare'},value:2},{axis:{$refText:'dup'},value:3}]},{name:'same',entries:[{value:4},{value:5},{value:6}]},{name:'same',entries:[{value:7},{value:8}]}],
 options:[{name:'showLegend',value:false},{name:'showLegend',value:true},{name:'ticks',value:0},{name:'ticks',value:99},{name:'max',value:10},{name:'min',value:0},{name:'graticule',value:'polygon'}],metadata:{title:'',accTitle:'',accDescr:''}
};

it('replays pinned native duplicate axes, first reference lookup, fallback labels, skipped curves, and last options',async()=>{
 const db=await native(source);try{const snapshot=captureRadarDb(db);expect(snapshot).toEqual({version:1,axes:[{name:'dup',label:'$$axis-one$$'},{name:'dup',label:'$$axis-two$$'},{name:'bare',label:'bare'}],curves:[{name:'c',label:'$$curve$$',entries:[1,1,2]},{name:'same',label:'same',entries:[4,5,6]},{name:'same',label:'same',entries:[7,8]}],options:{showLegend:true,ticks:32,max:10,min:0,graticule:'polygon'},title:'',accTitle:'',accDescr:''});expect(replayRadarDb(input)).toEqual(snapshot);expect(reconcileRadarDb(input,snapshot)).toEqual(snapshot);
 }finally{db.clear();}
});

it('captures detached native getters and retains direct-setter negative zero and NaN state',async()=>{
 const db=await native('radar-beta\naxis a,b\ncurve initial {1,2}\n');try{db.setCurves([{name:'numbers',entries:[{value:-0},{value:NaN}]}]);const snapshot=captureRadarDb(db);expect(Object.is(snapshot.curves[0]!.entries[0],-0)).toBe(true);expect(Number.isNaN(snapshot.curves[0]!.entries[1]!)).toBe(true);db.clear();expect(snapshot.curves).toHaveLength(1);expect(snapshot.axes).toHaveLength(2);
  const direct:RadarDbInput={axes:[{name:'a'},{name:'b'}],curves:[{name:'numbers',entries:[{value:-0},{value:NaN}]}],options:[],metadata:{title:'',accTitle:'',accDescr:''}};expect(reconcileRadarDb(direct,snapshot)).toEqual(snapshot);
 }finally{db.clear();}
});

it('rejects mutated native snapshots and hostile replay input',async()=>{
 const db=await native(source);try{const snapshot=captureRadarDb(db);const mutations:Array<(value:any)=>void>=[value=>value.version=2,value=>value.axes.reverse(),value=>value.curves[0].entries[0]=9,value=>value.options.ticks=31,value=>value.title='forged'];for(const [index,mutate]of mutations.entries()){const hostile=structuredClone(snapshot);mutate(hostile);expect(()=>reconcileRadarDb(input,hostile),`snapshot mutation ${index}`).toThrow();}
  const hostileInputs:Array<(value:any)=>void>=[value=>{value.curves[0].entries[0].axis.$refText='missing';value.curves[0].entries[2].axis.$refText='missing';},value=>value.options[0].value='true',value=>value.options.push({name:'unknown',value:1}),value=>value.curves[0].entries=[]];for(const [index,mutate]of hostileInputs.entries()){const hostile=structuredClone(input);mutate(hostile);expect(()=>replayRadarDb(hostile),`input mutation ${index}`).toThrow();}
  expect(replayRadarDb({...input,metadata:{...input.metadata,version:99,axes:[]}as any}as any)).toEqual(snapshot);for(const metadata of [{...input.metadata,title:0},{...input.metadata,accTitle:null},{...input.metadata,accDescr:{}}])expect(()=>replayRadarDb({...input,metadata}as any)).toThrow();
 }finally{db.clear();}
});
