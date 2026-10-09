declare module 'markdown-it/lib/rules_inline/image.js' {
  import type StateInline from 'markdown-it/lib/rules_inline/state_inline.js';
  const image: (state: StateInline, silent: boolean) => boolean;
  export default image;
}
