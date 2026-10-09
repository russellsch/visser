import { describe, expect, it } from 'vitest';
import { reconcileStateAccessibility, replayStateAccessibility } from '../../packages/core/src/mermaid/state-accessibility.ts';
import type { StateLabelRecord, StateLabels } from '../../packages/core/src/mermaid/state-labels.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';
import { prepareSequenceSanitizer, sanitizeSequenceField } from '../../packages/core/src/mermaid/sequence-sanitize.ts';

function labels(entries: readonly [StateLabelRecord['role'], string][]): StateLabels {
  const source = entries.map(entry => entry[1]).join('\n'); const mapped = ProvenanceText.identity(source); let at = 0;
  const records = entries.map(([role, text], index) => {
    const mappedValue = mapped.slice(at, at + text.length); at += text.length + 1;
    return { recordIndex: index + 1, role, semanticValue: text, mappedValue, intervals: [], synthetic: false } as StateLabelRecord;
  });
  return { records, root: [], parserSource: source };
}
function nativeLike() {
  let title = ''; let description = '';
  return { setAccTitle(value: string) { title = value.replace(/^\s+/g, ''); }, setAccDescription(value: string) { description = value.replace(/\n\s+/g, '\n'); },
    getAccTitle: () => title, getAccDescription: () => description };
}

describe('state accessibility reconciliation', () => {
  it('replays overwrites in source order and reconciles the final normalized fields without mutation', () => {
    const found = labels([['accTitle', ' first'], ['accDescr', 'one\n  two'], ['accTitle', ' final']]); const db = nativeLike();
    replayStateAccessibility(db, found);
    const result = reconcileStateAccessibility(db, found, value => value);
    expect(result).toEqual({ accTitle: { value: 'final', recordIndex: 3 }, accDescr: { value: 'one\ntwo', recordIndex: 2 } });
    expect(Object.isFrozen(result)).toBe(true); expect(db.getAccTitle()).toBe('final');
  });

  it('uses the real isolated sequence sanitizer with pinned common-DB normalization', async () => {
    await prepareSequenceSanitizer();
    const db = nativeLike();
    const found = labels([['accTitle', '  <b>Title</b>'], ['accDescr', 'first\n  <i>second</i>']]);
    replayStateAccessibility(db, found);
    const result = reconcileStateAccessibility(db, found, sanitizeSequenceField);
    expect(result.accTitle.value).toBe('<b>Title</b>');
    expect(result.accTitle.value).toBe(db.getAccTitle());
    expect(result.accDescr.value).toBe(db.getAccDescription());
    expect(result.accDescr.value).toContain('\n');
  });

  it('preserves entity text through the injected sanitizer contract and detects later DB mutation', () => {
    const found = labels([['accTitle', '&lt;safe&gt;']]); const db = nativeLike(); replayStateAccessibility(db, found);
    expect(reconcileStateAccessibility(db, found, value => value).accTitle.value).toBe('&lt;safe&gt;');
    db.setAccTitle('changed'); expect(() => reconcileStateAccessibility(db, found, value => value)).toThrow('accTitle differs');
  });

  it('handles absent fields and rejects missing or non-string getters', () => {
    const db = nativeLike(); const none = labels([]);
    expect(reconcileStateAccessibility(db, none, value => value)).toEqual({ accTitle: { value: '' }, accDescr: { value: '' } });
    expect(() => reconcileStateAccessibility({ getAccTitle: () => 1, getAccDescription: () => '' }, none, value => value)).toThrow('getters must return strings');
    expect(() => replayStateAccessibility({ setAccTitle() {} }, labels([['accDescr', 'x']]))).toThrow('missing setAccDescription');
  });
});
