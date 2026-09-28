// Unit-level fixes for install-pressure-1: the home folder rules (M6, m2, m9)
// and the repository-root rules (M4, M5). Nothing here touches the real home.
import { chmodSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { visserHome } from '../../packages/core/src/distribution/trust.ts';
import { findRepoRoot } from '../../packages/core/src/references/registry.ts';

describe('VISSER_HOME rules', () => {
  it('M6: a relative VISSER_HOME is E_USAGE', () => {
    expect(() => visserHome({ VISSER_HOME: 'rel/.visser', HOME: '/h' })).toThrow(expect.objectContaining({ code: 'E_USAGE' }));
  });

  it('m2: an empty VISSER_HOME means unset', () => {
    expect(visserHome({ VISSER_HOME: '', HOME: '/h' })).toBe('/h/.visser');
  });

  it('m9: with HOME and VISSER_HOME unset, Visser never guesses a home folder', () => {
    expect(() => visserHome({})).toThrow(expect.objectContaining({ code: 'E_USAGE' }));
  });
});

describe('repository root rules', () => {
  it('M4: the .visser that is VISSER_HOME does not mark its parent as a repository', () => {
    const home = mkdtempSync(join(tmpdir(), 'visser-root-'));
    mkdirSync(join(home, '.visser'));
    mkdirSync(join(home, 'notes', 'q'), { recursive: true });
    const env = { HOME: home, VISSER_HOME: join(home, '.visser') };
    expect(findRepoRoot(join(home, 'notes', 'q'), env)).toBeUndefined();
    // A real repository marker in the home folder still counts.
    mkdirSync(join(home, '.git'));
    expect(findRepoRoot(join(home, 'notes', 'q'), env)).toBe(home);
  });

  it('M5: the search stops at a folder that every user can write, such as /tmp', () => {
    const base = mkdtempSync(join(tmpdir(), 'visser-root-'));
    const shared = join(base, 'shared');
    mkdirSync(join(shared, '.git'), { recursive: true });
    mkdirSync(join(shared, 'mine', 'q'), { recursive: true });
    chmodSync(shared, 0o777);
    const env = { HOME: join(base, 'h') };
    expect(findRepoRoot(join(shared, 'mine', 'q'), env)).toBeUndefined();
    chmodSync(shared, 0o755);
    expect(findRepoRoot(join(shared, 'mine', 'q'), env)).toBe(shared);
  });
});
