import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { extractSequenceMath } from '../../packages/core/src/mermaid/sequence-math.ts';
let bundle: string;
test.beforeAll(async()=> {
  bundle = (await build({stdin:{contents:"import mermaid from 'mermaid'; import {reconcileSequenceMath} from './packages/core/src/mermaid/sequence-db.ts'; globalThis.mermaid=mermaid; globalThis.reconcileSequenceMath=reconcileSequenceMath;",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0]!.text;
});
const fixtures = {
  sanitized: `sequenceDiagram
title Header<br/>$$x$$
accTitle: <<interface>> $$x$$
accDescr {
 First<br> &dollar;&dollar;x&dollar;&dollar;
   Second
}
box teal Row<br/>$$b$$
participant A
end
A->>A: ordinary
`,
  metadata: String.raw`sequenceDiagram
participant A@{alias: "$$suppressed$$"} as Explicit
participant B@{alias: "\u0024\u0024b\u0024\u0024", type: boundary}
participant C@{alias: ["$$old$$"]}
participant C as Replaced $$c$$
participant A@{alias: "$$a$$"} as A
A->>B: $$m$$
B->>C: ordinary
`,
  systemColor: 'sequenceDiagram\n' + 'accentcolor|accentcolortext|activetext|buttonborder|buttonface|buttontext|canvas|canvastext|field|fieldtext|graytext|highlight|highlighttext|linktext|mark|marktext|selecteditem|selecteditemtext|visitedtext|activeborder|activecaption|appworkspace|background|buttonhighlight|buttonshadow|captiontext|inactiveborder|inactivecaption|inactivecaptiontext|infobackground|infotext|menu|menutext|scrollbar|threeddarkshadow|threedface|threedhighlight|threedlightshadow|threedshadow|window|windowframe|windowtext'.split('|').map((color,index)=>`box ${color} $$x$$\nparticipant A${index}\nend\n`).join(''),
  assignments: `sequenceDiagram
title Earlier $$x$$
title Final $$y$$
accTitle: Accessible $$a$$
accDescr {
 First $$b$$
   Second
}
participant A as Earlier
participant A as :nowrap: Final $$c$$
participant B
A->>B: :wrap: Message $$m$$
Note over A,B: Note $$n$$
`,
  branches: `sequenceDiagram
participant A
participant B
alt First $$x$$
A->>B: Yes
else Second $$y$$
B->>A: No
end
par Work $$p$$
A->>A: self
and Other $$q$$
B->>B: self
end
critical Required $$c$$
A->>B: Try
option Recovery $$r$$
B->>A: Recover
end
`,
  boxes: `sequenceDiagram
box Group $$g$$
participant A as $$a$$
end
box rebeccapurple :nowrap: Colored $$c$$
participant B as $$b$$
end
A->>B: $$x$$<br/>$$y$$
`,
};
for (const [name,source] of Object.entries(fixtures)) test(`sequence collector matches real browser DB: ${name}`, async({page})=> {
  const {records} = await extractSequenceMath(source);
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const actual = await page.evaluate(async ({source,records})=> {
    const mermaid=(window as any).mermaid;
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base'});
    const {db}=await mermaid.mermaidAPI.getDiagramFromText(source);
    const reconcile=(window as any).reconcileSequenceMath;
    const slots=reconcile(db,records);
    const mutationFailures: boolean[]=[];
    const actor=db.getActors().values().next().value;
    if(actor) {
      for(const field of ['description','type','wrap','box']) {
        const original=actor[field];actor[field]='changed';
        try {reconcile(db,records);mutationFailures.push(false);}catch {mutationFailures.push(true);}finally {actor[field]=original;}
      }
    }
    const box=db.getBoxes()[0];
    if(box) {
      const original=box.wrap;box.wrap=!original;
      try {reconcile(db,records);mutationFailures.push(false);}catch {mutationFailures.push(true);}finally {box.wrap=original;}
    }
    const activeActor=records.find(r=>r.active&&(r.role==='actor'||r.role==='actor.metadata'))!;
    for(const altered of [records.filter(r=>r!==activeActor), [...records,activeActor]]) {
      try {reconcile(db,altered);mutationFailures.push(false);}catch {mutationFailures.push(true);}
    }
    const first=records.find(r=>r.messageIndex!==undefined);
    if(first) for(const field of ['id','type','from','to','placement','wrap','activate','centralConnection']) {
      const message=db.getMessages()[first.messageIndex!], original=message[field];message[field]='changed';
      try {reconcile(db,records);mutationFailures.push(false);}catch {mutationFailures.push(true);}finally {message[field]=original;}
    }
    return {slots,mutationFailures,actors:[...db.getActors()].map(([id,a]:[string,any])=>({id,text:a.description})),
      messages:db.getMessages().map((m:any)=>m.message),boxes:db.getBoxes().map((b:any)=>b.name).filter(Boolean),
      title:db.getDiagramTitle(),accTitle:db.getAccTitle(),accDescr:db.getAccDescription()};
  },{source,records});
  expect(actual.slots.length).toBeGreaterThan(0);
  expect(actual.mutationFailures.length).toBeGreaterThan(0);
  expect(actual.mutationFailures.every(Boolean)).toBe(true);
  expect(records.filter(r=>r.active&&(r.role==='actor'||r.role==='actor.metadata')).map(r=>({id:r.ownerId!,text:r.semanticValue})).sort((a,b)=>a.id.localeCompare(b.id))).toEqual(actual.actors.sort((a,b)=>a.id.localeCompare(b.id)));
  expect(records.filter(r=>r.role==='box').map(r=>r.semanticValue)).toEqual(actual.boxes);
  for(const r of records.filter(r=>r.messageIndex!==undefined)) expect(r.semanticValue).toBe(actual.messages[r.messageIndex!]);
  for(const role of ['title','accTitle','accDescr'] as const) {
    expect(records.find(r=>r.active&&r.role===role)?.semanticValue ?? '').toBe(actual[role]);
  }
});
