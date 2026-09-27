import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPacket,
  documentRoots,
  locateDocument,
  parsePacket,
  refreshReference,
  RefreshRefused,
  resolveReference,
  showReference,
  type ReferencePacket,
} from '../../packages/core/src/references/index.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';

const EXAMPLE = new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname;

function tempRepo(): { repo: string; doc: string } {
  const repo = mkdtempSync(join(tmpdir(), 'visser-refs-'));
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'docs/explanations/queue'), { recursive: true });
  const doc = join(repo, 'docs/explanations/queue/index.md');
  copyFileSync(EXAMPLE, doc);
  return { repo, doc };
}

function edit(doc: string, change: (text: string) => string): void {
  writeFileSync(doc, change(readFileSync(doc, 'utf8')));
}

function packetFor(repo: string, doc: string, id: string, quote?: string): ReferencePacket {
  // A reader copy carries issuedBy: reader; refs show packets are only for other targets.
  const shown = showReference(doc, id, { repoRoot: repo, ...(quote ? { quote } : {}) });
  return parsePacket(shown.yaml.replace('issuedBy: refs-show', 'issuedBy: reader'));
}

function moveEnqueueToEnd(text: string): string {
  const start = text.indexOf('{% edge id="enqueue"');
  const end = text.indexOf('{% edge id="dequeue"');
  const block = text.slice(start, end);
  return text.slice(0, start) + text.slice(end).replace('{% /graph %}', `${block}{% /graph %}`);
}

describe('registry (§11.5)', () => {
  it('finds the document by docId in the default root @R12', () => {
    const { repo, doc } = tempRepo();
    expect(locateDocument('4f8ac70c-7e14-4f06-9865-e194f57c7239', { repoRoot: repo })).toEqual({ status: 'found', path: doc });
  });

  it('reports two primary files with one docId as ambiguous', () => {
    const { repo } = tempRepo();
    mkdirSync(join(repo, 'docs/explanations/copy'));
    copyFileSync(EXAMPLE, join(repo, 'docs/explanations/copy/index.md'));
    const packet = packetFor(repo, join(repo, 'docs/explanations/queue/index.md'), 'enqueue');
    // showReference works on an explicit path; resolution by docId is ambiguous.
    const { result } = resolveReference(packet, { repoRoot: repo });
    expect(result.status).toBe('ambiguous');
    expect(result.diagnostics[0]!.code).toBe('E_DOC_DUPLICATE');
  });

  it('rejects document roots that escape the repository', () => {
    const { repo } = tempRepo();
    mkdirSync(join(repo, '.visser'));
    for (const root of ['../outside', '/etc', 'docs/../../x']) {
      writeFileSync(join(repo, '.visser/config.json'), JSON.stringify({ schema: 'visser-workspace/1', documentRoots: [root] }));
      expect(() => documentRoots(repo)).toThrow(/E_PATH_ESCAPE|inside the repository|relative/);
    }
    const outside = mkdtempSync(join(tmpdir(), 'visser-outside-'));
    symlinkSync(outside, join(repo, 'linked'));
    writeFileSync(join(repo, '.visser/config.json'), JSON.stringify({ schema: 'visser-workspace/1', documentRoots: ['linked'] }));
    expect(() => documentRoots(repo)).toThrow(/outside the repository/);
  });

  it('refuses to show a document outside the configured roots', () => {
    const { repo } = tempRepo();
    const outside = join(repo, 'elsewhere.md');
    copyFileSync(EXAMPLE, outside);
    expect(() => showReference(outside, 'enqueue', { repoRoot: repo })).toThrow(/outside the configured document roots/);
  });
});

describe('resolution (§11.6)', () => {
  it('resolves an unchanged packet exactly, with current text and context @R12', () => {
    const { repo, doc } = tempRepo();
    const { result } = resolveReference(packetFor(repo, doc, 'enqueue'), { repoRoot: repo });
    expect(result.status).toBe('exact');
    expect(result.current!.sourceText.startsWith('{% edge id="enqueue"')).toBe(true);
    expect(result.current!.parentContext).toContain('{% graph id="handoff"');
    expect(result.current!.parentContext).not.toContain('{% node id="producer"');
    expect(result.current!.dependencies.map((d) => d.id)).toEqual(['producer', 'queue', 'src_queue']);
    expect(result.labelMatches).toBe(true);
    expect(validateAgainst('resolve', result)).toEqual({ ok: true });
  });

  it('uses the section heading as context for a top-level paragraph', () => {
    const { repo, doc } = tempRepo();
    const { result } = resolveReference(packetFor(repo, doc, 'p_takeaway'), { repoRoot: repo });
    expect(result.current!.parentContext).toContain('# A full queue blocks producers, not consumers');
  });

  it('reports stale after the heading text changes @T01 @T09', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'overview');
    edit(doc, (t) => t.replace('# A full queue blocks producers, not consumers', '# Why a full queue blocks producers'));
    const { result } = resolveReference(packet, { repoRoot: repo });
    expect(result.status).toBe('stale');
    expect(result.targetBodyUnchanged).toBe(false);
    expect(result.current!.target.id).toBe('overview');
  });

  it('keeps the binding when a paragraph is inserted above the target @T02', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'p_limits');
    edit(doc, (t) => t.replace('<!-- vs:id p_limits -->', '<!-- vs:id p_new -->\nA new paragraph.\n\n<!-- vs:id p_limits -->'));
    const { result } = resolveReference(packet, { repoRoot: repo });
    expect(result.status).toBe('stale');
    expect(result.targetBodyUnchanged).toBe(true);
    expect(result.current!.sourceText).toContain('This is a teaching implementation');
  });

  it('reports a moved but unchanged edge as stale with targetBodyUnchanged @T03', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'enqueue');
    edit(doc, moveEnqueueToEnd);
    const { result } = resolveReference(packet, { repoRoot: repo });
    expect(result.status).toBe('stale');
    expect(result.targetBodyUnchanged).toBe(true);
  });

  it('resolves identical paragraphs independently by ID, not by quote @T04', () => {
    const { repo, doc } = tempRepo();
    edit(doc, (t) => t.replace('<!-- vs:id p_vocabulary -->', '<!-- vs:id p_twin_a -->\nSame words.\n\n<!-- vs:id p_twin_b -->\nSame words.\n\n<!-- vs:id p_vocabulary -->'));
    const a = packetFor(repo, doc, 'p_twin_a', 'Same words.');
    const b = packetFor(repo, doc, 'p_twin_b', 'Same words.');
    const ra = resolveReference(a, { repoRoot: repo }).result;
    const rb = resolveReference(b, { repoRoot: repo }).result;
    expect(ra.status).toBe('exact');
    expect(rb.status).toBe('exact');
    expect(ra.current!.target.span.startByte).not.toBe(rb.current!.target.span.startByte);
    expect(ra.quoteFound).toBe(true);
  });

  it('still resolves after the document folder is renamed @T08', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'enqueue');
    renameSync(join(repo, 'docs/explanations/queue'), join(repo, 'docs/explanations/renamed'));
    const { result } = resolveReference(packet, { repoRoot: repo });
    expect(result.status).toBe('exact');
    expect(result.current!.target.id).toBe('enqueue');
  });

  it('reports a wrong body digest at the current revision as invalid @T10', () => {
    const { repo, doc } = tempRepo();
    const good = packetFor(repo, doc, 'enqueue');
    const { packet } = createPacket({ docId: good.docId, targetId: good.targetId, sourceRevision: good.sourceRevision, bodySha256: '0'.repeat(64), issuedBy: 'reader' });
    const { result } = resolveReference(packet, { repoRoot: repo });
    expect(result.status).toBe('invalid');
    expect(result.diagnostics[0]!.code).toBe('E_REF_INVALID');
  });

  it('ignores a forged sourceHint and cannot read outside the roots @T11 @R12', () => {
    const { repo, doc } = tempRepo();
    const good = packetFor(repo, doc, 'enqueue');
    const forged = parsePacket(createPacket({ ...good, quote: undefined, sourceHint: '/etc/passwd', issuedBy: 'reader' } as never).yaml);
    const { result } = resolveReference(forged, { repoRoot: repo });
    expect(result.status).toBe('exact');
    expect(result.current!.target.span.path).toBe('index.md');
    const elsewhere = { ...good, docId: '11111111-1111-4111-8111-111111111111' } as ReferencePacket;
    expect(resolveReference(elsewhere, { repoRoot: repo }).result.status).toBe('missing');
  });

  it('reports a retired target as deleted and an unknown one as missing', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'p_limits');
    edit(doc, (t) => t
      .replace('visibility: private\n', 'visibility: private\nretiredTargets:\n  p_limits:\n    reason: "merged into p_takeaway"\n    replacement: p_takeaway\n')
      .replace(/<!-- vs:id p_limits -->\n[\s\S]*?\n\n/, ''));
    const deleted = resolveReference(packet, { repoRoot: repo }).result;
    expect(deleted.status).toBe('deleted');
    expect(deleted.diagnostics[0]!.message).toContain('p_takeaway');
    const missing = { ...packet, targetId: 'never_existed' } as ReferencePacket;
    expect(resolveReference(missing, { repoRoot: repo }).result.status).toBe('missing');
  });

  it('flags a label that does not match the current target', () => {
    const { repo, doc } = tempRepo();
    const packet = { ...packetFor(repo, doc, 'enqueue'), label: 'something else' } as ReferencePacket;
    expect(resolveReference(packet, { repoRoot: repo }).result.labelMatches).toBe(false);
  });
});

describe('refresh (§11.10)', () => {
  it('reissues a moved packet with only --acknowledge-stale @T03', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'enqueue');
    edit(doc, moveEnqueueToEnd);
    const current = resolveReference(packet, { repoRoot: repo }).result.currentRevision!;
    expect(() => refreshReference(packet, current, { stale: false, bodyChange: false }, { repoRoot: repo })).toThrow(RefreshRefused);
    const fresh = refreshReference(packet, current, { stale: true, bodyChange: false }, { repoRoot: repo });
    expect(fresh.targetBodyUnchanged).toBe(true);
    expect(fresh.packet.sourceRevision).toBe(current);
    expect(fresh.packet.issuedBy).toBe('reader');
    expect(resolveReference(fresh.packet, { repoRoot: repo }).result.status).toBe('exact');
  });

  it('requires --acknowledge-body-change when the target text changed @T19', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'enqueue');
    edit(doc, (t) => t.replace('A notification is not a reservation.', 'A wakeup is not a reservation.'));
    const current = resolveReference(packet, { repoRoot: repo }).result.currentRevision!;
    let refused: RefreshRefused | undefined;
    try {
      refreshReference(packet, current, { stale: true, bodyChange: false }, { repoRoot: repo });
    } catch (e) {
      refused = e as RefreshRefused;
    }
    expect(refused).toBeInstanceOf(RefreshRefused);
    expect(refused!.code).toBe('E_REF_STALE');
    expect(refused!.currentText).toContain('A wakeup is not a reservation.');
    const fresh = refreshReference(packet, current, { stale: true, bodyChange: true }, { repoRoot: repo });
    expect(fresh.targetBodyUnchanged).toBe(false);
  });

  it('refuses when --expected-current is not the current revision', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'enqueue');
    edit(doc, moveEnqueueToEnd);
    expect(() => refreshReference(packet, 'f'.repeat(64), { stale: true, bodyChange: true }, { repoRoot: repo })).toThrow(/expected-current/);
  });
});
