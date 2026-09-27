// Repository identity rule: which `repository` values does check accept?
import { tempRepo } from './lib.ts';
import { loadBundle } from './tmp/new/packages/core/src/model/bundle.ts';
const base = (repo: string) => `---
format: explain/1
docId: 11111111-2222-4333-8444-555555555555
title: T
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# T

{% source id="src_a" kind="git" title="A" repository=${JSON.stringify(repo)} commit="0123456789abcdef0123456789abcdef01234567" file="a.py" start=1 end=1 excerptSha256="PLACEHOLDER" %}
\`\`\`python
x = 1
\`\`\`
{% /source %}
`;
import { createHash } from 'node:crypto';
const sha = createHash('sha256').update('x = 1\n').digest('hex');
for (const r of ['/home/r/app', 'file:///home/r/app', 'https://user:pw@github.com/o/r.git', 'https://github.com/o/r.git',
  '~/src/app', '../app', 'C:\\Users\\r\\app', '\\\\server\\share\\app', 'home/r/app', 'git@github.com:o/r.git', 'ssh://git@host/o/r.git', 'https://github.com/o/r.git?token=abc']) {
  const { doc } = tempRepo(base(r).replace('PLACEHOLDER', sha));
  const d = loadBundle(doc).diagnostics.filter((x) => x.severity === 'error').map((x) => x.code);
  console.log(r.padEnd(40), JSON.stringify(d));
}
