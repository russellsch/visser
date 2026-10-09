import { beforeAll, describe, expect, it } from 'vitest';
import stub from '../../packages/core/src/mermaid/dompurify-stub.ts';
import { prepareSequenceSanitizer } from '../../packages/core/src/mermaid/sequence-sanitize.ts';
import { withStateSanitizer } from '../../packages/core/src/mermaid/state-node-db.ts';

describe('synchronous private state sanitizer scope', () => {
  beforeAll(prepareSequenceSanitizer);
  it('delegates one pass with native options and restores the original dependency', () => {
    const previous = stub.sanitize;
    const input = '<span>text</span>';
    withStateSanitizer(() => {
      expect(stub.sanitize(input)).toBe(input);
      const native = stub as { sanitize(text: string, options: { FORBID_TAGS: string[] }): string };
      expect(native.sanitize(input, { FORBID_TAGS: ['span'] })).toBe('text');
    });
    expect(stub.sanitize).toBe(previous);
    expect(stub.sanitize('<script>following figure</script>')).toBe('<script>following figure</script>');
  });

  it('restores nested scopes and thrown extraction or listener failures', () => {
    const previous = stub.sanitize;
    withStateSanitizer(() => {
      const outer = stub.sanitize;
      expect(() => withStateSanitizer(() => { throw new Error('listener failed'); })).toThrow('listener failed');
      expect(stub.sanitize).toBe(outer);
      expect(stub.sanitize('<br/>')).toBe('<br>');
    });
    expect(stub.sanitize).toBe(previous);
    expect(() => withStateSanitizer(() => stub.sanitize({}))).toThrow('expected native text');
    expect(stub.sanitize).toBe(previous);
  });

  it('rejects asynchronous use and restores the dependency immediately', () => {
    const previous = stub.sanitize;
    expect(() => withStateSanitizer(() => Promise.resolve())).toThrow('asynchronous boundary');
    expect(stub.sanitize).toBe(previous);
  });
});
