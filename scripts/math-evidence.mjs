// Field-level math acceptance. A test tag or a suite-wide pass is not field proof.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const retainedMathCases = Array.from({ length: 29 }, (_, i) => `COV-${String(i + 1).padStart(2, '0')}`).filter(id => !['COV-25', 'COV-26'].includes(id));
// Independent approval pin: evidence edits cannot silently remove a field or
// delivery check. Updating obligations requires reviewing this pin alongside
// coverage.md and the plan, rather than merely regenerating candidate hashes.
export const MATH_FIELD_INVENTORY_SHA256 = '1e190728d1403859cd58e99a0f014176112841bf89bf27a4747401ddaf7ed9d7';
export const COV29_AUTHORED_FIELDS_DERIVATION = Object.freeze({
  kind: 'COV29/projection.authored-fields/markdown', count: 121,
  sha256: '67f31fb721e9098d333321e46bc3c303516d3ad2f5e5fd46bff06b5e34137c94',
});
export const DEFERRED_MERMAID_SOURCE_VIEW = Object.freeze([
  'browser-success', 'browser-nojs', 'browser-failure', 'browser-long', 'browser-print',
].map(check => Object.freeze({ id: 'COV-28', field: 'viewer.source', check, reason: 'mermaid-source-view-deferred' })));
const keyOf = entry => `${entry?.id}/${entry?.field}/${entry?.check}`;
const COV29_AUTHORED_FIELDS_KEY = 'COV-29/projection.authored-fields/markdown';

export function mathCandidateSha256(root) {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
  const inputs = [...new Set(paths)].filter(path => /^(packages|scripts|tests|fixtures|schemas|skills|examples)\//.test(path) ||
    /^(package(-lock)?\.json|.*config\.(ts|json))$/.test(path) || path === 'docs/validation/math-rendering/coverage-fields.json').sort();
  return sha256(JSON.stringify(inputs.map(path => [path, sha256(readFileSync(join(root, path)))])));
}

export function junitCases(xml) {
  const document = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  return [...document.querySelectorAll('testcase')].map(test => ({
    suite: test.getAttribute('classname'), test: test.getAttribute('name'),
    project: test.closest('testsuite')?.getAttribute('hostname') ?? null,
    passed: !test.querySelector('failure, error, skipped'),
  }));
}

/** Inputs are injected so malformed, skipped, stale and missing evidence are testable. */
export function checkMathEvidence({ requirements, evidence, candidateSha256, readReport }) {
  const errors = [];
  if (requirements?.schema !== 'visser-math-fields/1' || !Array.isArray(requirements.cases)) return ['Invalid math field inventory'];
  if (sha256(JSON.stringify(requirements.cases)) !== MATH_FIELD_INVENTORY_SHA256) errors.push('Math field inventory differs from the approved fields and delivery checks');
  if (evidence?.schema !== 'visser-math-evidence/1' || !Array.isArray(evidence.entries)) return ['Invalid math evidence manifest'];
  if (!/^[a-f0-9]{64}$/.test(candidateSha256 ?? '') || evidence.candidateSha256 !== candidateSha256) errors.push('Math evidence candidate does not match current source inputs');
  const expected = new Set();
  const ids = requirements.cases.map(row => row.id);
  if (new Set(ids).size !== ids.length || ids.length !== retainedMathCases.length || retainedMathCases.some(id => !ids.includes(id))) errors.push('Math inventory must contain every retained COV case exactly once');
  for (const row of requirements.cases) {
    if (!Array.isArray(row.fields) || !row.fields.length || !Array.isArray(row.checks) || !row.checks.length) {
      errors.push(`${row.id}: fields and checks must be nonempty`); continue;
    }
    for (const field of row.fields) for (const check of row.checks) {
      const key = `${row.id}/${field}/${check}`;
      if (typeof field !== 'string' || !field || typeof check !== 'string' || !check || expected.has(key)) errors.push(`Invalid or duplicate requirement ${key}`);
      expected.add(key);
    }
  }
  const markdownDependencies = [...expected].filter(key => key.endsWith('/markdown') && !key.startsWith('COV-29/')).sort();
  if (markdownDependencies.length !== COV29_AUTHORED_FIELDS_DERIVATION.count || sha256(JSON.stringify(markdownDependencies)) !== COV29_AUTHORED_FIELDS_DERIVATION.sha256) errors.push('COV29 derivation dependencies differ from the reviewed scope');
  const deferredExpected = new Map(DEFERRED_MERMAID_SOURCE_VIEW.map(entry => [keyOf(entry), entry]));
  const supplied = new Set(), proven = new Set();
  const reports = new Map();
  for (const entry of evidence.entries) {
    const key = keyOf(entry);
    if (!expected.has(key)) errors.push(`Unknown math evidence obligation ${key}`);
    if (supplied.has(key)) errors.push(`Duplicate math evidence obligation ${key}`);
    supplied.add(key);
    if (key === COV29_AUTHORED_FIELDS_KEY) { errors.push(`${key}: aggregate must use its recognized derivation`); continue; }
    if (deferredExpected.has(key)) { errors.push(`${key}: deferred obligation cannot be proven directly`); continue; }
    let valid = expected.has(key);
    if (typeof entry.report !== 'string' || !/^reports\/[A-Za-z0-9_./-]+\.xml$/.test(entry.report) || entry.report.split('/').includes('..')) {
      errors.push(`${key}: invalid report path`); continue;
    }
    try {
      if (!reports.has(entry.report)) {
        const bytes = readReport(entry.report);
        reports.set(entry.report, { digest: sha256(bytes), cases: junitCases(bytes.toString()) });
      }
      const report = reports.get(entry.report);
      if (entry.reportSha256 !== report.digest) { errors.push(`${key}: report digest differs`); valid = false; }
      if (entry.candidateSha256 !== candidateSha256) { errors.push(`${key}: test result is from another candidate`); valid = false; }
      const browser = entry.check.startsWith('browser-');
      const matches = report.cases.filter(test => test.suite === entry.suite && test.test === entry.test && (!browser || test.project === entry.project));
      if (!matches.length || matches.some(test => !test.passed)) { errors.push(`${key}: exact passing testcase is missing, skipped or failed`); valid = false; }
      if (browser && (!entry.report.includes('playwright') || !entry.suite?.endsWith('.spec.ts') || typeof entry.project !== 'string' || !entry.project)) { errors.push(`${key}: browser evidence requires a Playwright report, browser spec and exact project`); valid = false; }
    } catch (error) { errors.push(`${key}: cannot read test evidence (${error.message})`); valid = false; }
    if (valid) proven.add(key);
  }
  const deferred = new Set();
  if (!Array.isArray(evidence.deferred)) errors.push('Missing math deferred obligations');
  else for (const entry of evidence.deferred) {
    const key = keyOf(entry), expectedDeferred = deferredExpected.get(key);
    if (!expectedDeferred || entry?.reason !== expectedDeferred.reason) errors.push(`Unknown or invalid deferred math obligation ${key}`);
    if (deferred.has(key)) errors.push(`Duplicate deferred math obligation ${key}`);
    deferred.add(key);
  }
  for (const key of deferredExpected.keys()) if (!deferred.has(key)) errors.push(`Missing deferred math obligation ${key}`);
  if (!Array.isArray(evidence.derivations)) errors.push('Missing math derivations');
  else {
    const derivations = new Set();
    for (const derivation of evidence.derivations) {
      const kind = derivation?.kind;
      if (derivations.has(kind)) errors.push(`Duplicate math derivation ${kind}`);
      derivations.add(kind);
      if (kind !== COV29_AUTHORED_FIELDS_DERIVATION.kind || derivation?.count !== COV29_AUTHORED_FIELDS_DERIVATION.count || derivation?.sha256 !== COV29_AUTHORED_FIELDS_DERIVATION.sha256) { errors.push(`Unknown or invalid math derivation ${kind}`); continue; }
      if (markdownDependencies.every(key => proven.has(key))) proven.add(COV29_AUTHORED_FIELDS_KEY);
      else errors.push(`${COV29_AUTHORED_FIELDS_KEY}: derivation has unproven, stale or skipped dependencies`);
    }
    if (!derivations.has(COV29_AUTHORED_FIELDS_DERIVATION.kind)) errors.push(`Missing math derivation ${COV29_AUTHORED_FIELDS_DERIVATION.kind}`);
  }
  for (const key of expected) if (!deferred.has(key) && !proven.has(key)) errors.push(`Unproven math field ${key}`);
  return errors;
}
