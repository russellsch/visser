// Sanitizer-owned fields retain HTML serialization in the native DB. Undo one
// serialization layer only inside existing equations, never parse author HTML
// or discover new delimiters by decoding arbitrary character references.
export function sequenceMathTextReplacements(text: string): {start: number; end: number; text: string}[] {
  const edits: {start: number; end: number; text: string}[] = [];
  for (const formula of text.matchAll(/\$\$(.*?)\$\$/g)) {
    for (const entity of formula[0].matchAll(/&(?:amp|lt|gt|nbsp);/g)) {
      const start = formula.index + entity.index;
      edits.push({start, end: start + entity[0].length,
        text: ({'&amp;':'&', '&lt;':'<', '&gt;':'>', '&nbsp;':'\u00a0'})[entity[0]]!});
    }
  }
  return edits;
}

export function sequenceSanitizedMathText(text: string): string {
  const result = text.replace(/<\/?br\s*\/?>/gi, '\n');
  const chunks: string[] = [];
  let cursor = 0;
  for (const edit of sequenceMathTextReplacements(result)) {
    chunks.push(result.slice(cursor, edit.start), edit.text);
    cursor = edit.end;
  }
  chunks.push(result.slice(cursor));
  return chunks.join('');
}
