import { createHash } from 'node:crypto';
const STATE_SHA256='33ba302a233f6a2b43efd12b2ba42cd1878d637bf79d351d5901812728c9318d';

// Class definitions and assignments must use the same namespace. The original
// artifact is attested even when the observer has already transformed it.
export function patchStateClasses(original, classesImport, transformed=original) {
  if(createHash('sha256').update(original).digest('hex')!==STATE_SHA256) throw new Error('Mermaid state artifact changed; review authored class isolation');
  let result=transformed;
  for(const [marker,assignment] of [
    ['  addStyleClass(id, styleAttributes = "") {','    id = visserStateAuthorClasses(id);'],
    ['  setCssClass(itemIds, cssClassName) {','    cssClassName = visserStateAuthorClasses(cssClassName);'],
  ]) {
    if(result.split(marker).length!==2) throw new Error('Mermaid state class patch is ambiguous');
    result=result.replace(marker,`${marker}\n${assignment}`);
  }
  return `import { stateAuthorClasses as visserStateAuthorClasses } from ${JSON.stringify(classesImport)};\n`+result;
}
