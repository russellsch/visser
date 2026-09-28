import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { inspectionProfile, instanceDepth } from '../../packages/core/src/model/inspection.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';

const FRONTMATTER = `---
format: visser/1
docId: 2f06ec72-88f2-4a4e-a2c7-1183b9f48b2a
title: Inspection depth
kind: reference
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---
<!-- vs:id h_top -->
# Inspection depth
`;

function model() {
  const dir = mkdtempSync(join(tmpdir(), 'visser-depth-'));
  const excerpt = 'limit=100\n';
  const excerptSha256 = normalizedTextSha256(new TextEncoder().encode(excerpt));
  writeFileSync(join(dir, 'index.md'), `${FRONTMATTER}
{% compare id="cmp" title="Queues" question="Which queue?" %}
{% option id="opt" label="Bounded" /%}
{% criterion id="plain" label="Failure" /%}
{% criterion id="timed" label="Latency" units="ms" /%}
{% criterion id="sourced" label="Capacity" /%}
{% criterion id="nested" label="Operation" /%}
{% cell id="cell_plain" option="opt" criterion="plain" value="waits" /%}
{% cell id="cell_explain" option="opt" criterion="timed" value="12" %}
The producer sees the wait.
{% /cell %}
{% cell id="cell_source" option="opt" criterion="sourced" value="100" evidence=["src"] /%}
{% cell id="cell_nested" option="opt" criterion="nested" value="FIFO" %}
{% detail id="nested_detail" label="Why FIFO" %}
One writer preserves insertion order.
{% /detail %}
{% /cell %}
{% /compare %}

{% graph id="map" mode="architecture" title="Queue path" question="Where does work wait?" %}
{% node id="api" label="API" role="interface" /%}
{% node id="queue" label="Queue" role="storage" /%}
{% edge id="edge_source" from="api" to="queue" kind="call" label="writes" evidence=["src"] /%}
{% /graph %}

{% trace id="log" scale="time" timeUnit="s" title="Log" question="When?" %}
{% event id="ob_full" label="Pool full" kind="observation" time=3 evidence=["src"] /%}
{% /trace %}

{% graph id="why" mode="cause" title="Why" question="What fills the pool?" %}
{% factor id="load" label="Load rises" basis="observed" /%}
{% factor id="pool" label="Pool fills" basis="observed" /%}
{% causal-link id="ob_link" from="load" to="pool" label="holds connections" basis="observed" evidence=["ob_full"] /%}
{% /graph %}

{% source id="src" title="Queue limit" kind="example" excerptSha256="${excerptSha256}" %}
\`\`\`text
${excerpt.trimEnd()}
\`\`\`
{% /source %}
`);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return bundle.model;
}

describe('inspection depth', () => {
  it('classifies explanation, generated context, sources-only, and bare targets', () => {
    const m = model();
    expect(inspectionProfile(m, 'cell_explain').depth).toBe('explanation');
    expect(inspectionProfile(m, 'timed').depth).toBe('context');
    expect(inspectionProfile(m, 'edge_source').depth).toBe('evidence');
    expect(inspectionProfile(m, 'cell_source').depth).toBe('context');
    expect(inspectionProfile(m, 'cell_plain').depth).toBe('context');
    expect(inspectionProfile(m, 'opt').depth).toBe('bare');
    const nested = inspectionProfile(m, 'cell_nested');
    expect(nested.depth).toBe('context');
    expect(nested.context).toContain('nested-detail:nested_detail');
    const observation = inspectionProfile(m, 'ob_link');
    expect(observation.evidenceIds).toEqual(['ob_full', 'src']);
    expect(instanceDepth(observation, { context: ['fact:basis'] })).toBe('evidence');
    expect(inspectionProfile(m, 'ob_link')).toBe(observation);
  });

  it('subtracts only the payload visible in a particular instance', () => {
    const m = model();
    const criterion = inspectionProfile(m, 'timed');
    expect(instanceDepth(criterion)).toBe('context');
    expect(instanceDepth(criterion, { context: ['fact:units'] })).toBe('bare');

    const sourced = inspectionProfile(m, 'cell_source');
    expect(instanceDepth(sourced, { context: ['fact:value'] })).toBe('evidence');
    expect(instanceDepth(sourced, { context: ['fact:value'], evidence: true })).toBe('bare');

    const explained = inspectionProfile(m, 'cell_explain');
    expect(instanceDepth(explained, { context: ['fact:value'] })).toBe('explanation');
    expect(instanceDepth(explained, { explanation: true, context: ['fact:value'] })).toBe('bare');
  });
});
