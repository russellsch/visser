import {erGenericText} from './er-generic-text.ts';
import {sequenceSanitizedMathText} from './sequence-text.ts';
export type ERDisplayPath='simple-header'|'table'|'edge'|'group-cluster'|'group-node'|'raw-cluster';
export const erSanitizerOwned=(path:ERDisplayPath):boolean=>path==='simple-header'||path==='group-cluster'||path==='group-node';
export const erRendererSanitizes=(path:ERDisplayPath):boolean=>path==='simple-header'||path==='group-node';
export const erDisplayPathValid=(path:unknown):path is ERDisplayPath=>path==='simple-header'||path==='table'||path==='edge'||path==='group-cluster'||path==='group-node'||path==='raw-cluster';
export const decodeERPrivateEntities=(text:string):string=>text.replace(/ﬂ°°/g,'&#').replace(/ﬂ°/g,'&').replace(/¶ß/g,';');

/** raw-cluster covers unsanitized entity names selected by native graph-ID
 * collisions; it must not recover group-title serialization.
 * Input at the final checked math hook, after any renderer sanitation. This
 * is the adapter's math contract, not native createText's backslash-collapsing
 * math branch. Table brackets remain literal text, never HTML. Plain fields
 * must continue through the native renderer rather than use this helper. */
export function erMathText(text:string,path:ERDisplayPath):string {
  if(!erDisplayPathValid(path))throw new TypeError('Invalid ER display path');
  const decoded=decodeERPrivateEntities(text);
  const prepared=erSanitizerOwned(path)?sequenceSanitizedMathText(decoded):decoded.replace(/<\/?br\s*\/?>/gi,'\n');
  return path==='table'?erGenericText(prepared):prepared;
}
