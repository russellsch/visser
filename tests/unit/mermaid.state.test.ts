// State transitions map to the renderer's edge numbers (review-c): note
// connectors also take edge numbers, so the relation index is not enough.
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { projectText } from '../../packages/core/src/model/project.ts';

const doc = (body: string) => `---
format: explain/1
docId: 0f0c2a52-8a3b-4c61-9f7e-2b6d1c0e9a11
title: State fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# State fixture

{% mermaid id="fig" title="Worker states" question="When does the worker rest?" %}
\`\`\`mermaid
${body}
\`\`\`
{% /mermaid %}
`;

const model = (body: string) => buildTargetRecords(parseSource(new TextEncoder().encode(doc(body)), 'index.md'));

describe('Mermaid state transitions and start/end markers (§9.12)', () => {
  const withNotes = 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : start\n  note right of Idle : waits here\n  Busy --> Idle : done\n  note left of Busy : works\n  Busy --> [*]';

  it('maps transitions to the drawn edge numbers when notes are present', () => {
    const m = model(withNotes);
    expect(m.diagnostics).toEqual([]);
    const figure = m.mermaid.get('fig')!;
    expect(figure.relationships.map((r) => [r.from, r.to, r.renderKey])).toEqual([
      ['idle', 'busy', 'transition:1'],
      ['busy', 'idle', 'transition:3'],
    ]);
  });

  it('marks initial and terminal states from the [*] transitions', () => {
    const figure = model(withNotes).mermaid.get('fig')!;
    const idle = figure.elements.find((e) => e.id === 'idle')!;
    const busy = figure.elements.find((e) => e.id === 'busy')!;
    expect(idle.initial).toBe(true);
    expect(idle.terminal).toBeUndefined();
    expect(busy.terminal).toBe(true);
    expect(busy.initial).toBeUndefined();
  });

  it('projects (initial) and (terminal)', () => {
    const parsed = parseSource(new TextEncoder().encode(doc(withNotes)), 'index.md');
    const text = projectText(parsed);
    expect(text).toMatch(/Idle \(initial\)/);
    expect(text).toMatch(/Busy \(terminal\)/);
  });
});

describe('flowchart-elk is parsed as a flowchart (§9.12)', () => {
  it('gives node targets, not a figure-level target', () => {
    const m = model('flowchart-elk LR\n  Api --> Db');
    expect(m.diagnostics).toEqual([]);
    const figure = m.mermaid.get('fig')!;
    expect(figure.parsed).toBe(true);
    expect(figure.elements.map((e) => e.id)).toEqual(['api', 'db']);
  });
});
