// Reference fixture for the §2.3 budgets: about 5,000 words, 8 visuals (one of
// each family: architecture, trace, state, transform, cause, compare, plan,
// Mermaid), at most 40 nodes and 80 edges in any one visual, and 20 excerpt
// files of about 5 KiB each (about 100 KiB in total) that `visser capture
// file` adds as sources. No photographs.
//
// Output is deterministic: a fixed-seed generator picks the prose, so two runs
// with the same docId write the same bytes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXCERPT_COUNT = 20;
export const EXCERPT_BYTES = 5 * 1024;
// Two paragraphs before each visual and after the last one give about 5,000
// reading words: the Markdown projection without ID markers and before the
// 20 excerpts are captured.
const PARAGRAPHS_PER_VISUAL = 2;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUBJECTS = ['The scheduler', 'The lease store', 'Each worker', 'The admission queue', 'The retry planner', 'The result sink', 'The heartbeat monitor', 'The quota service', 'The dispatcher', 'The audit log'];
const VERBS = ['records', 'checks', 'renews', 'rejects', 'orders', 'batches', 'publishes', 'reads', 'releases', 'compares'];
const OBJECTS = ['the job lease before it starts work', 'a deadline for every attempt', 'the tenant quota at admission', 'the last heartbeat of each worker', 'a fencing token with each write', 'the attempt count in the job record', 'the result under the job key', 'expired leases once per second', 'the queue depth for each tenant', 'the retry delay from the attempt count'];
const CLAUSES = ['so a slow worker cannot finish a job that another worker already owns', 'because the store is the only place where ownership is decided', 'which keeps a retry from creating a second copy of the job', 'so that the dispatcher never waits on a remote call while it holds the queue lock', 'and the check happens before any side effect', 'which bounds how long a crashed worker can hold a job', 'so a burst from one tenant cannot starve the others', 'and a missed renewal ends the lease at the next sweep', 'because a clock on a worker can drift but a token cannot go backwards', 'which is why the sink ignores a write with an older token'];

function sentence(r) {
  const pick = (list) => list[Math.floor(r() * list.length)];
  return `${pick(SUBJECTS)} ${pick(VERBS)} ${pick(OBJECTS)}, ${pick(CLAUSES)}.`;
}

function paragraph(r, id, sentences) {
  const lines = [];
  for (let i = 0; i < sentences; i++) lines.push(sentence(r));
  return `<!-- vs:id ${id} -->\n${lines.join(' ')}\n`;
}

function architecture() {
  const out = ['{% graph id="fig_arch" mode="architecture" title="Responsibilities in the job platform" question="Which component decides ownership of a job, and which ones only read it?" %}', 'Arrows are calls and messages, not execution order.', ''];
  const groups = ['g_edge', 'g_core', 'g_workers', 'g_storage'];
  const labels = { g_edge: 'Edge', g_core: 'Control plane', g_workers: 'Worker fleet', g_storage: 'Storage' };
  for (const g of groups) out.push(`{% group id="${g}" label="${labels[g]}" %}`, `Components deployed together as ${labels[g].toLowerCase()}.`, '{% /group %}', '');
  const roles = ['interface', 'process', 'process', 'storage'];
  for (let i = 0; i < 40; i++) {
    const g = groups[i % 4];
    const role = i === 39 ? 'external' : roles[i % 4];
    const group = role === 'external' ? '' : ` group="${g}"`;
    out.push(`{% node id="n_${i}"${group} label="Component ${i + 1}" role="${role}" %}`, `Owns one step of job handling: ${OBJECTS[i % OBJECTS.length]}.`, '{% /node %}', '');
  }
  for (let i = 0; i < 80; i++) {
    const from = i % 40;
    const to = (from + 1 + (i >= 40 ? 7 : 0)) % 40;
    out.push(`{% edge id="e_${i}" from="n_${from}" to="n_${to}" kind="${i % 3 === 0 ? 'data' : 'call'}" label="${VERBS[i % VERBS.length]} step ${i + 1}" /%}`);
  }
  out.push('{% /graph %}', '');
  return out.join('\n');
}

function trace() {
  const actors = ['a_client', 'a_dispatch', 'a_worker', 'a_store'];
  const names = { a_client: 'Client', a_dispatch: 'Dispatcher', a_worker: 'Worker', a_store: 'Lease store' };
  const out = ['{% trace id="fig_trace" title="One job from submission to result" question="When does the worker own the job, and what ends that ownership?" scale="ordinal" %}', 'The lease is taken before work starts and released after the result is written.', ''];
  for (const a of actors) out.push(`{% actor id="${a}" label="${names[a]}" /%}`);
  out.push('');
  for (let i = 0; i < 16; i++) {
    const after = i === 0 ? '' : ` after=["ev_${i - 1}"]`;
    out.push(`{% event id="ev_${i}" actor="${actors[i % 4]}" label="Step ${i + 1}: ${VERBS[i % VERBS.length]}" kind="${i % 2 ? 'receive' : 'state-change'}"${after} %}`, `${sentence(rng(100 + i))}`, '{% /event %}', '');
  }
  out.push('{% /trace %}', '');
  return out.join('\n');
}

function state() {
  const states = ['queued', 'leased', 'running', 'retrying', 'succeeded', 'failed', 'cancelled', 'expired'];
  const out = ['{% graph id="fig_state" mode="state" title="A job ends in exactly one terminal state" question="Which events can move a running job back to the queue?" %}', 'Only the lease store changes a job state.', ''];
  states.forEach((s, i) => {
    const flag = i === 0 ? ' initial=true' : ['succeeded', 'failed', 'cancelled'].includes(s) ? ' terminal=true' : '';
    out.push(`{% state id="st_${s}" label="${s[0].toUpperCase()}${s.slice(1)}"${flag} %}`, `The job is ${s}.`, '{% /state %}', '');
  });
  const tr = [['queued', 'leased', 'lease granted'], ['leased', 'running', 'worker starts'], ['running', 'succeeded', 'result written'], ['running', 'retrying', 'attempt failed'], ['retrying', 'queued', 'delay elapsed'], ['retrying', 'failed', 'attempts exhausted'], ['leased', 'expired', 'lease timeout'], ['running', 'expired', 'heartbeat missed'], ['expired', 'queued', 'sweeper requeues'], ['queued', 'cancelled', 'client cancels'], ['running', 'cancelled', 'client cancels'], ['leased', 'queued', 'worker declines']];
  tr.forEach(([a, b, ev], i) => out.push(`{% transition id="tr_${i}" from="st_${a}" to="st_${b}" event="${ev}" label="${ev}" /%}`));
  out.push('{% /graph %}', '');
  return out.join('\n');
}

function transform() {
  const stages = [['request body', 'JSON bytes', 'network buffer'], ['job spec', 'typed record', 'dispatcher memory'], ['queue entry', 'serialized record', 'queue storage'], ['lease record', 'row with token', 'lease store'], ['work input', 'decoded payload', 'worker memory'], ['result', 'encoded bytes', 'worker memory'], ['stored result', 'object with metadata', 'result store']];
  const out = ['{% transform id="fig_transform" title="A job changes form five times" question="Where is information lost between the request and the stored result?" %}', ''];
  stages.forEach(([label, rep, loc], i) => out.push(`{% stage id="sg_${i}" label="${label}" representation="${rep}" location="${loc}" %}`, `The job as ${label}.`, '{% /stage %}', ''));
  for (let i = 0; i < stages.length - 1; i++) {
    const loss = i === 1 ? ' loss="unknown fields in the request are dropped"' : '';
    out.push(`{% conversion id="cv_${i}" from="sg_${i}" to="sg_${i + 1}" label="${VERBS[i]}"${loss} /%}`);
  }
  out.push('{% /transform %}', '');
  return out.join('\n');
}

function cause() {
  const out = ['{% graph id="fig_cause" mode="cause" title="Why duplicate results appeared" question="Which link in the chain is inferred rather than observed?" %}', ''];
  const basis = ['observed', 'observed', 'inferred', 'observed', 'inferred', 'hypothesis', 'observed', 'inferred', 'observed', 'hypothesis'];
  for (let i = 0; i < 10; i++) out.push(`{% factor id="f_${i}" label="Factor ${i + 1}" basis="${basis[i]}" %}`, sentence(rng(200 + i)), '{% /factor %}', '');
  const links = [[0, 2], [1, 2], [2, 3], [3, 4], [4, 6], [5, 6], [6, 7], [7, 8], [8, 9], [1, 4], [0, 5], [3, 7]];
  links.forEach(([a, b], i) => out.push(`{% causal-link id="cl_${i}" from="f_${a}" to="f_${b}" label="link ${i + 1}" basis="${basis[b]}" /%}`));
  out.push('{% /graph %}', '');
  return out.join('\n');
}

function compare() {
  const options = ['op_lease', 'op_lock', 'op_queue'];
  const optionLabels = ['Leases with fencing tokens', 'Distributed lock', 'Single consumer queue'];
  const criteria = ['cr_dup', 'cr_latency', 'cr_ops', 'cr_crash'];
  const criterionLabels = ['Duplicate results', 'Added latency', 'Operational cost', 'Behavior after a crash'];
  const out = ['{% compare id="fig_compare" title="Three ways to give a job one owner" question="Which design still produces a duplicate after a worker pause?" %}', ''];
  options.forEach((o, i) => out.push(`{% option id="${o}" label="${optionLabels[i]}" /%}`));
  criteria.forEach((c, i) => out.push(`{% criterion id="${c}" label="${criterionLabels[i]}" /%}`));
  out.push('');
  options.forEach((o) => criteria.forEach((c) => out.push(`{% cell id="c_${o}_${c}" option="${o}" criterion="${c}" %}`, sentence(rng(o.length * 31 + c.length)), '{% /cell %}', '')));
  out.push('{% /compare %}', '');
  return out.join('\n');
}

function plan() {
  const status = ['complete', 'complete', 'ready', 'ready', 'blocked', 'blocked', 'proposed', 'proposed', 'proposed', 'proposed'];
  const out = ['{% graph id="fig_plan" mode="plan" title="Rolling out fencing tokens" question="Which step makes the rollout irreversible?" %}', ''];
  for (let i = 0; i < 10; i++) out.push(`{% task id="tk_${i}" label="Task ${i + 1}" status="${status[i]}" output="step ${i + 1} done" acceptance="check ${i + 1} passes" %}`, sentence(rng(300 + i)), '{% /task %}', '');
  const deps = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6], [6, 7], [6, 8], [7, 9], [8, 9], [1, 5]];
  deps.forEach(([a, b], i) => out.push(`{% dependency id="dp_${i}" from="tk_${a}" to="tk_${b}" label="needs task ${a + 1}" /%}`));
  out.push('{% /graph %}', '');
  return out.join('\n');
}

function mermaid() {
  const lines = ['flowchart LR'];
  for (let i = 0; i < 15; i++) lines.push(`  S${i}[Stage ${i + 1}] --> S${i + 1}[Stage ${i + 2}]`);
  lines.push('  S3 --> S9', '  S7 --> S12');
  return ['{% mermaid id="fig_mermaid" title="Request path through the edge" question="Which stages can a cached request skip?" %}', '```mermaid', ...lines, '```', '{% /mermaid %}', ''].join('\n');
}

/** Write index.md (without sources) and the excerpt files. Returns the excerpt paths. */
export function generateFixture(dir, docId) {
  mkdirSync(dir, { recursive: true });
  const r = rng(20260927);
  const parts = [
    '---',
    'format: visser/1',
    `docId: ${docId}`,
    'title: How the job platform keeps one owner per job',
    'kind: architecture',
    'capturedAt: 2026-09-27T00:00:00Z',
    'visibility: private',
    '---',
    '',
    '<!-- vs:id overview -->',
    '# How the job platform keeps one owner per job',
    '',
  ];
  const visuals = [architecture, trace, state, transform, cause, compare, plan, mermaid];
  let p = 0;
  for (const visual of visuals) {
    for (let i = 0; i < PARAGRAPHS_PER_VISUAL; i++) parts.push(paragraph(r, `p_${p++}`, 3));
    parts.push(visual());
  }
  for (let i = 0; i < PARAGRAPHS_PER_VISUAL; i++) parts.push(paragraph(r, `p_${p++}`, 3));
  writeFileSync(join(dir, 'index.md'), parts.join('\n'));

  const excerpts = join(dir, '..', 'excerpts');
  mkdirSync(excerpts, { recursive: true });
  const files = [];
  for (let i = 0; i < EXCERPT_COUNT; i++) {
    const lines = [`# Excerpt ${i + 1}: illustrative job platform code`];
    let n = 0;
    while (lines.join('\n').length < EXCERPT_BYTES - 80) {
      lines.push(`def step_${i}_${n}(job, lease):`, `    # ${sentence(r)}`, `    if lease.token < job.fence_${n % 7}:`, `        return reject(job, "stale token {}".format(lease.token))`, `    return job.advance(${n})`, '');
      n++;
    }
    const file = join(excerpts, `excerpt_${String(i + 1).padStart(2, '0')}.py`);
    writeFileSync(file, lines.join('\n') + '\n');
    files.push(file);
  }
  return files;
}
