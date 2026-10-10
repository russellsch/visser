import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { flowchartModel } from '../../packages/core/src/model/flowchart.ts';
import { inspectionProfile } from '../../packages/core/src/model/inspection.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { FLOWCHART_LIMITS, prospectiveFlowchartProxyCombinations, validateDocument } from '../../packages/core/src/model/validate.ts';

const valid = readFileSync(new URL('../fixtures/positive/native-flowchart.md', import.meta.url), 'utf8');
function analyze(text: string) {
  const parsed = parseSource(new TextEncoder().encode(text), 'index.md');
  const model = buildTargetRecords(parsed);
  return { parsed, model, diagnostics: [...parsed.diagnostics, ...model.diagnostics, ...validateDocument(parsed, model)] };
}

describe('native flowchart model @FCmodel', () => {
  it('preserves source identity while deriving canonical relationship labels', () => {
    const { model, diagnostics, parsed } = analyze(valid);
    expect(diagnostics).toEqual([]);
    expect(model.relationships.find((flow) => flow.id === 'receive-check')).toMatchObject({ kind: 'flow', label: '' });
    expect(model.targets.get('receive-check')?.label).toBe('Order received — continues to → Check order');
    expect(model.targets.get('yes')?.label).toBe('Order valid? — Yes → Ready');
    expect(projectText(parsed)).toContain('Order received — continues to → Check order');
  });

  it('adapts direction, membership, colors, and initial folds without proxy identity', () => {
    const { model } = analyze(valid);
    expect(flowchartModel(model, 'order')).toMatchObject({ direction: 'DOWN', initialCollapsed: ['repair'],
      groups: expect.arrayContaining([expect.objectContaining({ id: 'validation', color: 'teal' })]),
      nodes: expect.arrayContaining([expect.objectContaining({ id: 'valid', kind: 'decision' })]) });
    expect(inspectionProfile(model, 'valid').context).toContain('flowchart:structure');
    expect(inspectionProfile(model, 'validation').depth).toBe('context');
  });

  it('gates degree and reachability after endpoint references are valid', () => {
    const badEndpoint = valid.replace('to="ready" label="Yes"', 'to="missing" label="Yes"');
    const errors = analyze(badEndpoint).diagnostics;
    expect(errors.map((d) => d.code)).toContain('E_REF_BROKEN');
    expect(errors.map((d) => d.code)).not.toContain('E_SEMANTIC');
    expect(errors.map((d) => d.code)).not.toContain('W_FLOW_UNREACHABLE');
    const duplicate = valid.replace('id="no" from="valid" to="correct" label="No"', 'id="no" from="valid" to="correct" label="Yes"');
    expect(analyze(duplicate).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_SEMANTIC', targetId: 'no' })]));
  });

  it('checks endpoint kinds, group topology, normalized outcomes, and procedural warnings', () => {
    const codes = (text: string) => analyze(text).diagnostics.map((d) => d.code);
    expect(codes(valid.replace('to="ready" label="Yes"', 'to="validation" label="Yes"'))).toContain('E_REF_BROKEN');
    const cyclic = analyze(valid.replace('id="validation" label="Validation" color="teal"', 'id="validation" label="Validation" parent="repair" color="teal"')).diagnostics;
    expect(cyclic.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual(['E_SEMANTIC']);
    expect(codes(valid.replace('{% start id="received"', '{% group id="empty" label="Empty" /%}\n{% start id="received"'))).toContain('E_SEMANTIC');
    const emptyChild = valid.replace('{% start id="received"', '{% group id="emptychild" label="Empty child" parent="validation" /%}\n{% start id="received"');
    expect(analyze(emptyChild).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_SEMANTIC', targetId: 'emptychild' })]));
    expect(codes(valid.replace('label="No"', 'label=" Yes "'))).toContain('E_SEMANTIC');
    expect(codes(valid.replace('label="No"', 'label=""'))).toContain('E_SEMANTIC');
    const loop = valid.replace('id="retry" from="correct" to="check"', 'id="retry" from="correct" to="correct"');
    expect(analyze(loop).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'W_FLOW_NO_END_PATH', targetId: 'correct' })]));
    const extraEnd = valid.replace('{% end id="ready" label="Ready" /%}', '{% end id="ready" label="Ready" /%}\n{% end id="other" label="Other" /%}').replace('{% /flowchart %}', '{% flow id="other-end" from="valid" to="other" label="Other" /%}\n{% /flowchart %}');
    expect(analyze(extraEnd).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('accepts a start in a flowchart group', () => {
    const groupedStart = valid.replace('id="received" label="Order received"', 'id="received" label="Order received" group="validation"');
    expect(analyze(groupedStart).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('gates duplicate identities and reports degree, scope, and reachability in source order', () => {
    const duplicateId = analyze(valid.replace('id="retry"', 'id="yes"')).diagnostics;
    expect(duplicateId.map((d) => d.code)).toContain('E_ID_DUPLICATE');
    expect(duplicateId.map((d) => d.code)).not.toContain('E_SEMANTIC');
    expect(analyze(valid.replace('id="receive-check" from="received"', 'id="receive-check" from="check"')).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_SEMANTIC', targetId: 'received' })]));
    const other = `\n{% flowchart id="other" title="Other" question="Other?" %}\n{% start id="otherstart" label="Other start" /%}\n{% end id="otherend" label="Other end" /%}\n{% flow id="otherflow" from="otherstart" to="otherend" /%}\n{% /flowchart %}`;
    const cross = analyze((valid + other).replace('to="ready" label="Yes"', 'to="otherend" label="Yes"')).diagnostics;
    expect(cross).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_REF_BROKEN', targetId: 'yes' })]));
    expect(cross.map((d) => d.code)).not.toContain('W_FLOW_UNREACHABLE');
    const detached = valid.replace('{% /flowchart %}', `{% action id="u1" label="U1" /%}\n{% action id="u2" label="U2" /%}\n{% flow id="u12" from="u1" to="u2" /%}\n{% flow id="u21" from="u2" to="u1" /%}\n{% /flowchart %}`);
    expect(analyze(detached).diagnostics.filter((d) => d.code === 'W_FLOW_UNREACHABLE').map((d) => d.targetId)).toEqual(['u1', 'u2']);
  });

  it('keeps group color contextual to flowcharts', () => {
    const architecture = valid
      .replace('{% flowchart id="order" title="Validate an order" question="Can the order proceed?" direction="down" %}', '{% graph id="order" mode="architecture" title="Validate an order" question="Can the order proceed?" %}')
      .replace('{% /flowchart %}', '{% /graph %}');
    expect(analyze(architecture).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_SYNTAX', targetId: 'validation' })]));
  });

  it('does not add flowchart structure to an architecture group', () => {
    const architecture = `---\nformat: visser/1\ndocId: 9c0c5e2a-9999-4a99-8a99-999999999972\ntitle: T\nkind: teaching\ncapturedAt: 2026-10-10T00:00:00Z\nvisibility: private\n---\n{% graph id="map" mode="architecture" title="T" question="Q?" %}\n{% group id="baregroup" label="Bare" /%}\n{% /graph %}`;
    expect(inspectionProfile(analyze(architecture).model, 'baregroup').depth).toBe('bare');
  });

  it('enforces W0 group bounds before layout allocation', () => {
    const groups = Array.from({ length: FLOWCHART_LIMITS.groups - 1 }, (_, i) => `{% group id="g${i}" label="G${i}" /%}`).join('\n');
    const over = valid.replace('{% start id="received" label="Order received" /%}', `${groups}\n{% start id="received" label="Order received" /%}`);
    expect(analyze(over).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_LAYOUT_LIMIT', targetId: 'order' })]));
  });

  it('admits and rejects the exact W0 group and parent-depth boundaries', () => {
    const chart = (groups: number, depth = 1) => {
      const declarations = Array.from({ length: groups }, (_, i) => `{% group id="g${i}" label="G${i}"${i % depth ? ` parent="g${i - 1}"` : ''} /%}`).join('\n');
      const actions = Array.from({ length: groups }, (_, i) => `{% action id="a${i}" label="A${i}" group="g${i}" /%}`).join('\n');
      const flows = Array.from({ length: groups + 1 }, (_, i) => `{% flow id="f${i}" from="${i === 0 ? 's' : `a${i - 1}`}" to="${i === groups ? 'e' : `a${i}`}" /%}`).join('\n');
      return valid.replace(/\{% group[\s\S]*?\{% start id="received" label="Order received" \/%\}[\s\S]*?\{% \/flowchart %\}/, `${declarations}\n{% start id="s" label="S" /%}\n${actions}\n{% end id="e" label="E" /%}\n${flows}\n{% /flowchart %}`);
    };
    expect(analyze(chart(16)).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(analyze(chart(17)).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_LAYOUT_LIMIT', targetId: 'order' })]));
    expect(analyze(chart(4, 4)).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(analyze(chart(5, 5)).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_LAYOUT_LIMIT' })]));
  });

  it('counts generated proxy candidates saturating at the approved 256 boundary', () => {
    const groups = Array.from({ length: 4 }, (_, root) => Array.from({ length: 4 }, (_, depth) => ({ id: `g${root}${depth}`, attributes: depth ? { parent: `g${root}${depth - 1}` } : {} }))).flat();
    const nodes = groups.map((group) => ({ id: `n${group.id.slice(1)}`, attributes: { group: group.id } }));
    const flow = (id: string, from: string, to: string) => ({ id, attributes: { from, to } });
    const base = Array.from({ length: 10 }, (_, i) => flow(`x${i}`, 'n03', 'n13'));
    expect(prospectiveFlowchartProxyCombinations([...base, flow('eleven', 'n21', 'n32'), flow('five', 'n20', 'n31')] as any, nodes as any, groups as any)).toBe(256);
    expect(prospectiveFlowchartProxyCombinations([...base, flow('fourteen', 'n21', 'n33'), flow('three', 'n20', 'n30')] as any, nodes as any, groups as any)).toBe(257);
  });

  it('enforces native node and flow caps while admitting the exact boundaries', () => {
    const linear = (actions: number) => {
      const nodes = Array.from({ length: actions }, (_, i) => `{% action id="a${i}" label="A${i}" /%}`).join('\n');
      const flows = Array.from({ length: actions + 1 }, (_, i) => `{% flow id="f${i}" from="${i ? `a${i - 1}` : 's'}" to="${i === actions ? 'e' : `a${i}`}" /%}`).join('\n');
      return valid.replace(/\{% group[\s\S]*?\{% start id="received" label="Order received" \/%\}[\s\S]*?\{% \/flowchart %\}/, `{% start id="s" label="S" /%}\n${nodes}\n{% end id="e" label="E" /%}\n${flows}\n{% /flowchart %}`);
    };
    expect(analyze(linear(198)).diagnostics.filter((d) => d.severity === 'error')).toEqual([]); // start + 198 actions + end
    expect(analyze(linear(199)).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_LAYOUT_LIMIT' })]));
    const decisions = Array.from({ length: 198 }, (_, i) => `{% decision id="d${i}" label="D${i}" /%}`).join('\n');
    const chain = Array.from({ length: 198 }, (_, i) => [`{% flow id="next${i}" from="${i ? `d${i - 1}` : 's'}" to="d${i}"${i ? ' label="Next"' : ''} /%}`, `{% flow id="end${i}" from="d${i}" to="e" label="End ${i}" /%}`]).flat().join('\n');
    const extra = Array.from({ length: 4 }, (_, i) => `{% flow id="extra${i}" from="d197" to="e" label="Extra ${i}" /%}`).join('\n');
    const cap = valid.replace(/\{% group[\s\S]*?\{% start id="received" label="Order received" \/%\}[\s\S]*?\{% \/flowchart %\}/, `{% start id="s" label="S" /%}\n${decisions}\n{% end id="e" label="E" /%}\n${chain}\n${extra}\n{% /flowchart %}`);
    expect(analyze(cap).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(analyze(cap.replace('{% /flowchart %}', '{% flow id="over" from="d197" to="e" label="Over" /%}\n{% /flowchart %}')).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_LAYOUT_LIMIT' })]));
  });
});
