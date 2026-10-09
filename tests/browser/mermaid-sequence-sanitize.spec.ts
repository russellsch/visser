import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { prepareSequenceSanitizer, sanitizeSequenceField } from '../../packages/core/src/mermaid/sequence-sanitize.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';

let bundle: string;
test.beforeAll(async () => {
  await prepareSequenceSanitizer();
  bundle = (await build({ stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaid=mermaid;", resolveDir: process.cwd() },
    bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0]!.text;
});

test('isolated Node sanitizer equals native browser title sanitization', async ({ page }) => {
  const values = ['plain $$x$$', '&dollar;&dollar;x&dollar;&dollar;',
    '<br>&dollar;&dollar;x&dollar;&dollar;', '<BR/>$$x$$<br />$$y$$',
    ' \r\n<br> \r\n $$x$$', '<br>&#36&#36;x&#36;&#36;', '<br>&notit; &notin; &copy',
    '<br>&#0; &#xD800; &#1114112; &#x1f600; &#x0d; &nbsp;',
    '<br>&amp;dollar;&amp;dollar;x&amp;dollar;&amp;dollar;',
    'a <<interface>> $$x$$', '<<math>>$$x$$', '<!--removed--> $$x$$', '<!--> $$x$$',
    'a < 2 $$x$$', '<br>\u0000$$x$$', '<br/> &quot;$$x$$&quot;',
    '<<a target>> $$x$$', '<br><br> $$x$$ $$x$$', '<br>&#36;$$x$$',
    '<style>hidden</style>$$x$$', '<br>&lt;script&gt;$$x$$&lt;/script&gt;'];
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({ content: bundle });
  const actual = await page.evaluate(async values => {
    const mermaid = (window as any).mermaid;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    const { db } = await mermaid.mermaidAPI.getDiagramFromText('sequenceDiagram\nparticipant A');
    return values.map(value => { db.setDiagramTitle(value); return db.getDiagramTitle(); });
  }, values);
  for (const [index, value] of values.entries()) {
    expect(sanitizeSequenceField(ProvenanceText.identity(value)).text, value).toBe(actual[index]);
  }
});
