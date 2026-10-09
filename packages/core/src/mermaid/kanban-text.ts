import {sequenceSanitizedMathText} from './sequence-text.ts';

/**
 * Proposed input for Kanban's prelayout math hook, not native SVG Markdown
 * output. Preserve standard TeX backslashes, turn break tags into newlines,
 * and recover one sanitizer entity layer only within existing equations.
 */
export const kanbanMathText=(text:string):string=>sequenceSanitizedMathText(
  text.replace(/ﬂ°°/g,'&#').replace(/ﬂ°/g,'&').replace(/¶ß/g,';'),
);
