import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { parseSequenceBoxData } from '../../packages/core/src/mermaid/sequence-box.ts';
import { checkMermaidSource } from '../../packages/core/src/mermaid/rules.ts';

let bundle: string;
test.beforeAll(async () => {
  bundle = (await build({ stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaid=mermaid;", resolveDir: process.cwd() },
    bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0]!.text;
});

test('Node sequence box classifier matches native browser DB over the admitted color syntax', async ({ page }) => {
  const colors = ['teal', 'ReBeccAPurple', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
    'canvastext', 'window', 'notacolor', 'Group', 'rgb(1,2,3)', 'rgba(1,2,3)', 'rgb(1,2,3,0.5)', 'rgba(1,2,3,50%)',
    'rgb(1%,2%,3%)', 'rgb(.5,2,300)', 'rgba(1,2,3,9)', 'rgb(999,999,999)',
    'rgb(1%,2,3)', 'rgb(1,2%,3%)', 'rgb(1.,2,3)', 'rgb(.,2,3)', 'rgb(..1,2,3)', 'rgb(1%%,2%,3%)',
    'rgb(1,2)', 'rgb(1,2,3,4,5)', 'rgb (1,2,3)'];
  // Invalid component counts are rejected by the source profile before this
  // boundary. Other invalid CSS colors remain ordinary box-title text.
  const values = colors.flatMap(color => ['', ':wrap: ', ':nowrap: '].map(wrap => `${color} ${wrap}Group $$x$$`))
    .filter(value => !checkMermaidSource(`sequenceDiagram\nbox ${value}\nend`).some(issue => issue.code !== 'E_MATH'));
  values.push('', 'Plain title', ':wrap: $$x$$', ':nowrap: $$x$$', 'blue-suffix $$x$$');
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({ content: bundle });
  const actual = await page.evaluate(async values => {
    const mermaid = (window as any).mermaid;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    const { db } = await mermaid.mermaidAPI.getDiagramFromText('sequenceDiagram\nparticipant A');
    return values.map(value => db.parseBoxData(value));
  }, values);
  expect(values.length).toBeGreaterThan(65);
  for (const [index, value] of values.entries()) {
    expect(parseSequenceBoxData(value).data, value).toEqual(actual[index]);
  }
});
