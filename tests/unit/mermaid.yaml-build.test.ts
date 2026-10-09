import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
// @ts-expect-error build-time JavaScript module
import { instrumentMermaidYaml } from '../../scripts/mermaid-yaml-build.mjs';

const upstream = new URL('../../node_modules/mermaid/dist/chunks/mermaid.core/chunk-LNGE3PJU.mjs', import.meta.url);
const generated = new URL('../../packages/core/src/mermaid/vendor/yaml-provenance.mjs', import.meta.url);

describe('pinned Mermaid YAML build', () => {
  it('reproduces the checked-in vendor artifact exactly', async () => {
    const [source, expected] = await Promise.all([readFile(upstream, 'utf8'), readFile(generated, 'utf8')]);
    expect(instrumentMermaidYaml(source)).toBe(expected);
  });

  it('rejects changed upstream bytes before attempting patches', async () => {
    const source = await readFile(upstream, 'utf8');
    expect(() => instrumentMermaidYaml(`${source}\n`)).toThrow('Pinned Mermaid YAML source changed');
    expect(() => instrumentMermaidYaml('')).toThrow('Pinned Mermaid YAML source changed');
    expect(() => instrumentMermaidYaml(source.replace('function storeAnchor', 'function changedAnchor')))
      .toThrow('Pinned Mermaid YAML source changed');
  });
});
