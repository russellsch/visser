// Running an extension build entry (§14.3). The entry runs in a separate Node
// process with a wall-clock limit and a heap limit. This is resource control,
// NOT a sandbox: a trusted extension has the same OS privileges as the CLI.
// The entry reads one JSON input on stdin and prints one JSON output on stdout.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { TargetModel } from '../model/targets.ts';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';
import type { VerifiedExtension } from './manifest.ts';

export type Scalar = string | number | boolean;

export type ComponentInput = {
  schema: 'explain-component-input/1';
  api: 'explain-component/1';
  component: { id: string; title: string; question: string; attributes: Record<string, Scalar> };
  parts: Array<{ id: string; label: string; text: string; attributes: Record<string, Scalar> }>;
};

export type SvgNode = { tag: string; attrs?: Record<string, string | number>; target?: string; children?: Array<string | SvgNode> };

export type ComponentOutput = {
  schema: 'explain-component-output/1';
  svg: SvgNode;
  parts: Record<string, { text: string }>;
};

export type RunLimits = { timeoutMs: number; heapMb: number; outputBytes: number };

export const DEFAULT_LIMITS: RunLimits = { timeoutMs: 10_000, heapMb: 256, outputBytes: 4 * 1024 * 1024 };

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

function scalars(attributes: Record<string, unknown>, skip: readonly string[]): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const key of Object.keys(attributes).sort()) {
    const v = attributes[key];
    if (skip.includes(key)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[key] = v;
  }
  return out;
}

/** Every extension component of a document with its input; derived from source only. */
export function componentInputs(model: TargetModel): Array<{ id: string; use: string; input: ComponentInput }> {
  const out: Array<{ id: string; use: string; input: ComponentInput }> = [];
  for (const record of model.targets.values()) {
    if (record.kind !== 'extension') continue;
    const node = model.nodes.get(record.id);
    if (!node) continue;
    const a = node.attributes;
    const parts = [...model.targets.values()].filter((t) => t.parentId === record.id && t.kind === 'part').map((p) => {
      const pa = model.nodes.get(p.id)?.attributes ?? {};
      const text = p.plainText.startsWith(`${p.label}\n`) ? p.plainText.slice(p.label.length + 1) : p.plainText === p.label ? '' : p.plainText;
      return { id: p.id, label: p.label, text, attributes: scalars(pa, ['id', 'label']) };
    });
    out.push({
      id: record.id,
      use: String(a['use'] ?? ''),
      input: {
        schema: 'explain-component-input/1',
        api: 'explain-component/1',
        component: { id: record.id, title: String(a['title'] ?? ''), question: String(a['question'] ?? ''), attributes: scalars(a, ['id', 'title', 'question', 'use']) },
        parts,
      },
    });
  }
  return out;
}

function excerpt(text: string): string {
  // Printable ASCII only, so a hostile entry cannot put control sequences in a terminal.
  return text.replace(/[^\x20-\x7e\n]/g, '?').slice(0, 400).trim();
}

/**
 * Run a trusted extension's build entry on one component input. The caller
 * must have checked trust; this function only runs verified code.
 */
export function runBuildEntry(ext: VerifiedExtension, input: ComponentInput, limits: RunLimits = DEFAULT_LIMITS): ComponentOutput {
  const name = ext.manifest.name;
  const entry = join(ext.dir, ...ext.manifest.buildEntry.split('/'));
  const result = spawnSync(process.execPath, [`--max-old-space-size=${limits.heapMb}`, entry], {
    input: JSON.stringify(input),
    cwd: ext.dir,
    // A minimal environment: no tokens or other secrets from the caller's environment.
    env: { LANG: 'C' },
    timeout: limits.timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: limits.outputBytes,
    encoding: 'utf8',
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ETIMEDOUT') fail('E_EXTENSION_FAILED', `extension ${name} did not finish within ${limits.timeoutMs} ms`);
    if (code === 'ENOBUFS') fail('E_EXTENSION_FAILED', `extension ${name} printed more than ${limits.outputBytes} bytes`);
    fail('E_EXTENSION_FAILED', `extension ${name} could not run: ${result.error.message}`);
  }
  if (result.signal) fail('E_EXTENSION_FAILED', `extension ${name} was stopped by ${result.signal}`);
  if (result.status !== 0) fail('E_EXTENSION_FAILED', `extension ${name} exited with ${result.status}: ${excerpt(result.stderr ?? '')}`);
  let output: ComponentOutput;
  try {
    output = JSON.parse(result.stdout) as ComponentOutput;
  } catch {
    fail('E_EXTENSION_FAILED', `extension ${name} did not print one JSON value`);
  }
  const check = validateAgainst('componentOutput', output);
  if (!check.ok) fail('E_EXTENSION_FAILED', `extension ${name} output violates explain-component-output/1: ${check.errors.slice(0, 5).join('; ')}`);
  // Every part needs a text fallback (§18.6a): the figure is never the only form.
  for (const part of input.parts) {
    if (!output.parts[part.id]) fail('E_EXTENSION_FAILED', `extension ${name} gave no text fallback for part ${part.id}`);
  }
  for (const id of Object.keys(output.parts)) {
    if (!input.parts.some((p) => p.id === id)) fail('E_EXTENSION_FAILED', `extension ${name} described unknown part ${id}`);
  }
  return output;
}
