// The core skill, the handoff guide, and the canonical wrapper (§2.3, §12.7,
// §16, Appendix B). The skill must stay under its size target, name only real
// commands and subcommands, and send agents only to the user shim.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../packages/core/src/catalogue/index.ts';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const SKILL = read('skills/explain/SKILL.md');
const HANDOFF = read('skills/explain/references/handoff.md');
const WRAPPER = read('skills/explain/wrapper/SKILL.md');
const MAIN = read('packages/cli/src/main.ts');

// Commands the dispatcher handles, plus the Phase 5 commands that the parent
// wires (`catalogue`, `extension`); a command still listed only in DEFERRED
// for a later release would not be here.
const dispatched = new Set([...MAIN.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]!));
const COMMANDS = new Set([...dispatched, 'catalogue', 'extension']);
const SUBCOMMANDS: Record<string, readonly string[]> = {
  ids: ['assign'],
  refs: ['resolve', 'show', 'refresh', 'replace', 'retire'],
  capture: ['git', 'file'],
  skill: ['show'],
  catalogue: ['list', 'show'],
  trust: ['toolkit'],
  extension: ['inspect', 'trust'],
};

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Every `explain CMD [SUB]` mention, in inline code or a shell block. */
function mentions(text: string): Array<{ command: string; sub?: string }> {
  return [...text.matchAll(/(?:`|^)explain ([a-z]+)(?: ([a-z]+))?/gm)].map((m) => ({ command: m[1]!, ...(m[2] ? { sub: m[2] } : {}) }));
}

describe('core skill (§16, Appendix B) @R16', () => {
  it('stays under the 2,500-word target (§2.3)', () => {
    expect(words(SKILL)).toBeLessThan(2500);
  });

  it('names only commands and subcommands that exist', () => {
    const all = [...mentions(SKILL), ...mentions(HANDOFF)];
    expect(all.length).toBeGreaterThan(15);
    for (const { command, sub } of all) {
      expect(COMMANDS.has(command), `explain ${command}`).toBe(true);
      const subs = SUBCOMMANDS[command];
      if (subs && sub && !['doc', 'packet'].includes(sub)) expect(subs, `explain ${command} ${sub}`).toContain(sub);
    }
  });

  it('the dispatcher still lists every command the skill needs', () => {
    for (const command of ['init', 'ids', 'capture', 'check', 'build', 'serve', 'export', 'refs', 'fork', 'skill', 'doctor']) {
      expect(dispatched.has(command), command).toBe(true);
    }
  });

  it('routes through the user shim, reads the format and handoff guides, and names every catalogue pattern', () => {
    expect(SKILL).toContain('bin/explain.cjs');
    expect(SKILL).not.toMatch(/repository shim first/);
    expect(SKILL).toContain('references/format.md');
    expect(SKILL).toContain('references/handoff.md');
    for (const p of PATTERNS) expect(SKILL, p.name).toContain(`\`${p.name}\``);
  });

  it('keeps the authorization rules', () => {
    const flat = SKILL.replace(/\s+/g, ' ');
    for (const rule of [/never type an `excerptSha256`/i, /never write `docId`/i, /Do not install or trust anything yourself/, /Never claim visual inspection/, /publish documents/]) {
      expect(flat).toMatch(rule);
    }
  });
});

describe('handoff guide', () => {
  it('covers resolve, refresh, replace, retire, and every resolver status with its exit code', () => {
    for (const status of ['exact', 'stale', 'deleted', 'missing', 'ambiguous', 'invalid']) expect(HANDOFF).toMatch(new RegExp(`\\| \`${status}\` \\| [0-9] \\|`));
    for (const code of ['E_WRITE_CONFLICT', 'E_REF_STALE', 'E_ID_RETENTION', 'E_REF_INVALID']) expect(HANDOFF).toContain(code);
    expect(HANDOFF).toContain('--acknowledge-body-change');
  });
});

describe('canonical wrapper (§12.7)', () => {
  it('only loads the pinned skill through the user shim', () => {
    expect(WRAPPER).toMatch(/^---\nname: explain\n/);
    expect(WRAPPER).toContain('"${EXPLAIN_HOME:-$HOME/.explain}/bin/explain.cjs" skill show');
    expect(WRAPPER).not.toMatch(/\.explain\/bin|\.explain\/toolchains/);
    expect(words(WRAPPER)).toBeLessThan(250);
  });
});
