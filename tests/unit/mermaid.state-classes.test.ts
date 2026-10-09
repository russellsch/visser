import { expect, it } from 'vitest';
import { stateAuthorClasses } from '../../packages/core/src/mermaid/state-classes.ts';
it('isolates reserved classes after the native sentinel and attribute decode passes',()=>{
 for(const input of ['vs-selected','vsﬂ°°45¶ßselected','ﬂ°°118¶ßsﬂ°°x2d¶ßselected','ordinaryﬂ°Tab¶ßvsﬂ°°45¶ßselected','ordinaryﬂ°NewLine¶ßvs-selected']) {
  const output=stateAuthorClasses(input);
  expect(output).toContain('mermaid-authored-');
  expect(output.replace('mermaid-authored-','')).toBe(input);
  expect(stateAuthorClasses(output)).toBe(output);
 }
});
it('preserves ordinary encoded and raw HTML-reference class bytes without recursive decoding',()=>{
 for(const input of ['ordinary','ordinaryﬂ°°45¶ßclass','vs&#45;selected','vs&hyphen;selected','ordinaryﬂ°Tab¶ßother','mermaid-authored-vs-selected','vS-selected','vs\u00a0selected']) expect(stateAuthorClasses(input)).toBe(input);
});
it('keeps separate token positions through multiple expanded references',()=>{
 const input='vs-selected\tﬂ°°118¶ßs-selected ordinaryﬂ°°32¶ßvs-math';
 expect(stateAuthorClasses(input)).toBe('mermaid-authored-vs-selected\tmermaid-authored-ﬂ°°118¶ßs-selected ordinaryﬂ°°32¶ßmermaid-authored-vs-math');
});
