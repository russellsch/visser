export { parseSource, analyzeSource, blockKind, type Analysis, type UnmarkedBlock } from './parse.ts';
export { assignIds, IdsAssignError } from './ids.ts';
export { loadSourceText, lineByteRange, detectNewline, type SourceText } from './source-text.ts';
export { MARKER_LINE, TARGET_ID, INLINE_TAGS, BLOCK_TAGS, DYNAMIC_TAGS, LIMITS, ADDRESSABLE_BLOCKS } from './profile.ts';
