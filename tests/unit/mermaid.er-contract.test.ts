import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {expect,it} from 'vitest';
// @ts-expect-error build script is JavaScript.
import {erContractLoadHook,erContractPlugin,patchERContract} from '../../scripts/mermaid-er-contract.mjs';
const path=resolve('node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs'),source=()=>readFileSync(path,'utf8');
it('pins and appends the ER native contract',()=>{const patched=patchERContract(source());expect(patched).toContain('visserERContractVersion = 3');expect(patched).toContain('ErDB as VisserErDB');expect(patched).toContain('visserCaptureERData');expect(patched).toContain('common_default.sanitizeText');expect(()=>patchERContract(source()+'// drift')).toThrow(/artifact changed/);});
it('loads only the pinned artifact and enforces one plugin match per build',()=>{const hook=erContractLoadHook(),next=(url:any)=>({format:'module',source:'plain',url});expect(hook('file:///tmp/plain.mjs',{},next).source).toBe('plain');const callbacks:any={};erContractPlugin().setup({onStart:(f:any)=>callbacks.start=f,onLoad:(_:any,f:any)=>callbacks.load=f,onEnd:(f:any)=>callbacks.end=f});callbacks.start();expect(callbacks.end().errors[0].text).toMatch(/0/);callbacks.start();callbacks.load({path});expect(callbacks.end()).toBeUndefined();callbacks.load({path});expect(callbacks.end().errors[0].text).toMatch(/2/);});

it('executes the patched native module without changing DB state or configuration',()=>{
 const output=execFileSync(process.execPath,[resolve('tests/fixtures/math/er-contract-oracle.mjs')],{encoding:'utf8',timeout:30000});
 expect(JSON.parse(output)).toEqual({modes:2,configDetached:true,preparationPreservesState:true,detachedData:true});
},35000);
