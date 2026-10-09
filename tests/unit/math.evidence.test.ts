import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Node script intentionally shares the executable contract checker.
import { COV29_AUTHORED_FIELDS_DERIVATION, DEFERRED_MERMAID_SOURCE_VIEW, checkMathEvidence, junitCases, retainedMathCases, sha256 } from '../../scripts/math-evidence.mjs';

const candidate = 'a'.repeat(64);
const xml = '<testsuites><testsuite><testcase classname="tests/unit/math.test.ts" name="exact &amp; meaningful"/></testsuite></testsuites>';
const browserXml = xml.replace('<testsuite>', '<testsuite hostname="chromium-320">').replace('tests/unit/math.test.ts', 'math.spec.ts');
function input() {
  const requirements = JSON.parse(readFileSync('docs/validation/math-rendering/coverage-fields.json', 'utf8'));
  return {
    requirements,
    evidence: { schema: 'visser-math-evidence/1', candidateSha256: candidate, derivations: [{ ...COV29_AUTHORED_FIELDS_DERIVATION }], deferred: DEFERRED_MERMAID_SOURCE_VIEW.map((entry: { id: string; field: string; check: string; reason: string }) => ({ ...entry })), entries: requirements.cases.flatMap((row: { id: string; fields: string[]; checks: string[] }) => row.fields.flatMap(field => row.checks.map(check => ({
      id: row.id, field, check, report: check.startsWith('browser-') ? 'reports/playwright.xml' : 'reports/unit.xml', reportSha256: sha256(check.startsWith('browser-') ? browserXml : xml), candidateSha256: candidate,
      suite: check.startsWith('browser-') ? 'math.spec.ts' : 'tests/unit/math.test.ts', test: 'exact & meaningful', project: check.startsWith('browser-') ? 'chromium-320' : undefined,
    })).filter(entry => !(entry.id === 'COV-29' && entry.field === 'projection.authored-fields' && entry.check === 'markdown') && !DEFERRED_MERMAID_SOURCE_VIEW.some((deferred: { id: string; field: string; check: string }) => deferred.id === entry.id && deferred.field === entry.field && deferred.check === entry.check)))) },
    candidateSha256: candidate, readReport: (path: string) => Buffer.from(path.includes('playwright') ? browserXml : xml),
  };
}

describe('math field acceptance evidence @M02', () => {
  it('requires every retained case while excluding only the deferred Mermaid cases', () => {
    expect(retainedMathCases).toHaveLength(27);
    expect(retainedMathCases).not.toContain('COV-25');
    expect(retainedMathCases).not.toContain('COV-26');
    expect(checkMathEvidence(input())).toEqual([]);
    const missing = input();
    const removed = missing.evidence.entries.pop()!;
    expect(checkMathEvidence(missing)).toContain(`Unproven math field ${removed.id}/${removed.field}/${removed.check}`);
    missing.requirements.cases.pop();
    expect(checkMathEvidence(missing)).toContain('Math inventory must contain every retained COV case exactly once');
  });
  it('rejects removal of an approved field or delivery check even with a new candidate', () => {
    const field = input();
    field.requirements.cases[0].fields.pop();
    expect(checkMathEvidence(field)).toContain('Math field inventory differs from the approved fields and delivery checks');
    const delivery = input();
    delivery.requirements.cases[0].checks.pop();
    expect(checkMathEvidence(delivery)).toContain('Math field inventory differs from the approved fields and delivery checks');
  });
  it.each(['failure', 'error', 'skipped'])('does not accept a %s testcase or a broad tag match', (status) => {
    const changed = xml.replace('/>', `><${status}/></testcase>`);
    const value = input();
    value.readReport = () => Buffer.from(changed);
    for (const entry of value.evidence.entries) entry.reportSha256 = sha256(changed);
    expect(checkMathEvidence(value).some((message: string) => message.includes('exact passing testcase'))).toBe(true);
    value.readReport = () => Buffer.from(xml);
    value.evidence.entries[0].test = '@M02';
    expect(checkMathEvidence(value).some((message: string) => message.includes('exact passing testcase'))).toBe(true);
  });
  it('rejects stale candidate/report hashes, duplicate and unknown fields', () => {
    const value = input();
    value.evidence.entries[0].candidateSha256 = 'b'.repeat(64);
    value.evidence.entries[0].reportSha256 = 'c'.repeat(64);
    value.evidence.entries.push({ ...value.evidence.entries[1] });
    value.evidence.entries.push({ ...value.evidence.entries[1], field: 'invented' });
    const errors = checkMathEvidence(value).join('\n');
    expect(errors).toContain('another candidate');
    expect(errors).toContain('report digest differs');
    expect(errors).toContain('Duplicate math evidence');
    expect(errors).toContain('Unknown math evidence');
    value.evidence.candidateSha256 = 'b'.repeat(64);
    expect(checkMathEvidence(value)).toContain('Math evidence candidate does not match current source inputs');
  });
  it('rejects unreadable reports and unit reports claimed as browser evidence', () => {
    const value = input();
    value.requirements.cases[0].checks = ['browser-success'];
    value.evidence.entries[0].check = 'browser-success';
    expect(checkMathEvidence(value).join('\n')).toContain('requires a Playwright report');
    value.readReport = () => { throw new Error('missing'); };
    expect(checkMathEvidence(value).join('\n')).toContain('cannot read test evidence');
  });
  it('parses XML entities without treating failure text as passing evidence', () => {
    expect(junitCases(xml)).toEqual([{ suite: 'tests/unit/math.test.ts', test: 'exact & meaningful', project: null, passed: true }]);
    expect(() => junitCases('<broken>')).toThrow();
  });
  it('derives only COV29 authored Markdown from the reviewed complete direct dependency set', () => {
    const value = input();
    expect(value.evidence.derivations).toEqual([{ ...COV29_AUTHORED_FIELDS_DERIVATION }]);
    const dependency = value.evidence.entries.find((entry: any) => entry.check === 'markdown')!;
    value.evidence.entries = value.evidence.entries.filter((entry: any) => entry !== dependency);
    expect(checkMathEvidence(value).join('\n')).toContain('derivation has unproven, stale or skipped dependencies');
    const malformed = input();
    malformed.evidence.derivations[0].count--;
    malformed.evidence.entries.push({ id: 'COV-29', field: 'projection.authored-fields', check: 'markdown', report: 'reports/unit.xml', reportSha256: sha256(xml), candidateSha256: candidate, suite: 'tests/unit/math.test.ts', test: 'exact & meaningful' });
    const errors = checkMathEvidence(malformed).join('\n');
    expect(errors).toContain('Unknown or invalid math derivation');
    expect(errors).toContain('aggregate must use its recognized derivation');
  });
  it('requires exactly the five deferred Mermaid source-view browser obligations without proving them', () => {
    const value = input();
    expect(value.evidence.deferred).toEqual(DEFERRED_MERMAID_SOURCE_VIEW);
    value.evidence.deferred.pop();
    value.evidence.deferred.push({ ...DEFERRED_MERMAID_SOURCE_VIEW[0], reason: 'other' });
    const errors = checkMathEvidence(value).join('\n');
    expect(errors).toContain('Missing deferred math obligation');
    expect(errors).toContain('Unknown or invalid deferred math obligation');
  });
});
