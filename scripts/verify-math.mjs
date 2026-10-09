// Installed-release math smoke acceptance. All browser traffic is denied.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalJSON } from '../packages/core/src/model/hash.ts';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { parse as parseYaml } from 'yaml';

const root = resolve(import.meta.dirname, '..');
const reportDir = join(root, 'reports/math');
mkdirSync(reportDir, { recursive: true });
const base = mkdtempSync(join(tmpdir(), 'visser-math-acceptance-'));
const repo = join(base, 'repo'); mkdirSync(join(repo, '.git'), { recursive: true });
const env = { ...process.env, VISSER_HOME: join(base, 'home') };
const cli = join(root, 'dist/release/bin/visser.cjs');
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: repo, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
};
const doc = join(repo, 'math');
run('init', doc, '--kind', 'teaching', '--title', 'Math verification');
const index = join(doc, 'index.md');
const corpus = JSON.parse(readFileSync(join(root, 'docs/validation/math-rendering/correctness-corpus.json'), 'utf8'));
const cases = corpus.cases ?? corpus.expressions;
assert.ok(Array.isArray(cases), 'corpus cases required');
const body = cases.map((entry, i) => `<!-- vs:id math_${i} -->\n${entry.id}: $${entry.tex}$\n`).join('\n');
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + body + '\n<!-- vs:id eq_intro -->\nSee $x$ and {% eqref ref="energy" /%}.\n\n{% equation id="energy" %}\nE = mc^2\n{% /equation %}\n');
writeFileSync(index, readFileSync(index, 'utf8') + String.raw`
{% graph id="math_graph" mode="architecture" title="Math labels" question="Does the label fit?" %}
{% group id="math_group" label="Group $\\begin{matrix}a&b\\\\c&d\\end{matrix}$" collapsed=true /%}
{% node id="math_node" group="math_group" role="process" label="Rate $\\frac{a}{b}$" /%}
{% node id="math_sink" role="storage" label="Sink $x_i$" /%}
{% edge id="math_edge" from="math_node" to="math_sink" kind="data" label="Flow $x^2$" /%}
{% /graph %}

{% trace id="math_trace" title="Trace labels" question="Does the row fit?" %}
{% actor id="math_actor" label="Actor $x_i$" /%}
{% event id="math_event" actor="math_actor" kind="compute" label="Compute $\\begin{matrix}a&b\\\\c&d\\end{matrix}$" /%}
{% /trace %}

{% measure id="math_measure" title="Measured labels" question="Does the value fit?" unit="$x_i$" %}
{% reading id="math_reading" label="Reading $\\frac{a}{b}$" value=10 valueStatus="measured" /%}
{% /measure %}

<!-- vs:id math_terms -->
Read {% term ref="math_definition" %}the definition{% /term %}, {% detail-link ref="math_detail" %}the detail{% /detail-link %}, and {% cite ref="math_source" /%}.

{% definition id="math_definition" term="Squared value" auto=false %}
The value is $x^2$ with ${'`'}$literal$${'`'} code. A second sentence.
{% /definition %}

{% detail id="math_detail" label="Detail $x_i$" %}
Its body contains $x^2$.
{% /detail %}

{% source id="math_source" kind="web" title="Source $x_i$" url="https://example.invalid/math" capturedAt="2026-10-06T00:00:00Z" availability="link-only" /%}
`);
// Stress local scrolling and emergency print wrapping with one unbroken source.
const longTex = 'x_{' + 'abcdefghijklmnopqrstuvwxyz'.repeat(6) + '}';
writeFileSync(index, readFileSync(index, 'utf8') + '\n<!-- vs:id long_equation -->\n$$\n' + longTex + '\n$$\n');
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_pie" title="Math pie" question="Do the labels fit?" %}
The fractions and matrices remain readable in this chart.

${'```'}mermaid
pie showData
title Ratio $$x^2$$
"Rate $$\\frac{a}{b}$$" : 2
"Matrix $$\\begin{matrix}a&b\\\\c&d\\end{matrix}$$" : 3
${'```'}
{% /mermaid %}
`);
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_timeline" title="Math timeline" question="Do the events fit?" %}
The timeline reserves room for its formulas.

${'```'}mermaid
timeline
title Progress $$t^2$$
section Phase $$s$$
Task $$\frac{a}{b}$$ : Event $$x_i$$
${'```'}
{% /mermaid %}
`);
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_flowchart" title="Flowchart formulas" question="Do source bindings stay exact?" %}
The cluster, nodes and edge carry formulas.

${'```'}mermaid
flowchart LR
subgraph phase["Phase $$s$$"]
 flow_a["Rate $$\\frac{a}{b}$$"] -->|"Flow $$z$$"| flow_b
end
flow_b@{label: "\u0024\u0024y\u0024\u0024"}
flow_b --> flow_fork@{shape: fork}
${'```'}
{% /mermaid %}

{% mermaid id="math_collapsed" title="Collapsed formulas" question="Which formulas are visible?" %}
Hidden labels stay validated while visible labels retain their source.

${'```'}mermaid
flowchart-elk TD
subgraph hidden["Group $$g$$"]
 hidden_a["$$a$$"] -->|"$$inside$$"| hidden_b
end
hidden@{view: collapsed}
hidden_b -->|"$$outside$$"| outside_node
${'```'}
{% /mermaid %}
`);
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_encoded" title="Encoded formula" question="Does encoded math retain fallback?" %}
The source uses YAML escapes for its delimiter characters.

${'```'}mermaid
flowchart-elk LR
encoded_node@{label: "\u0024\u0024x\u0024\u0024"}
${'```'}
{% /mermaid %}

{% mermaid id="math_sequence" title="Sequence formula" question="Do mirrored labels keep their source?" %}
The participant formula uses encoded delimiters and appears in both actor copies.

${'```'}mermaid
sequenceDiagram
title Header<br/>Second row
accTitle: Accessible<br> &dollar;&dollar;x&dollar;&dollar;
box teal Participants
participant SeqA@{alias: "\u0024\u0024x\u0024\u0024"}
participant SeqB as Plain participant
end
properties SeqA: {"class":"actor vs-mermaid-source vs-selected vs-math","inert":"\u0024\u0024\\bad\u0024\u0024","nested":{"icon":"machine data"}}
SeqA->>SeqB: ordinary message
${'```'}
{% /mermaid %}
`);
const sequenceRoleTex = ['x < y','b','a','a','c','c','m','n','l','o','u','v','p','q','r','s','t'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_sequence_roles" title="Sequence label roles" question="Can every label contain an equation?" %}
Each ordinary sequence label role carries a distinct equation.

${'```'}mermaid
sequenceDiagram
title $$x < y$$
accTitle: $$a$$
accDescr: $$d$$
box teal $$b$$
participant RoleA as $$a$$
participant RoleB as $$c$$
end
RoleA->>RoleB: $$m$$
Note over RoleA,RoleB: $$n$$
loop $$l$$
RoleA->>RoleB: ordinary
end
opt $$o$$
RoleA->>RoleB: ordinary
end
alt $$u$$
RoleA->>RoleB: ordinary
else $$v$$
RoleB->>RoleA: ordinary
end
par $$p$$
RoleA->>RoleB: ordinary
and $$q$$
RoleB->>RoleA: ordinary
end
critical $$r$$
RoleA->>RoleB: ordinary
option $$s$$
RoleB->>RoleA: ordinary
end
break $$t$$
RoleA->>RoleB: ordinary
end
${'```'}
{% /mermaid %}
`);
const stateRoleTex = ['state-title', 'state-body', 'plain-box', 'note-copy', 'edge-copy', 'sentinel-copy'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_state" title="State formulas" question="Do state labels retain their authored sources?" %}
The visible state labels, note, edge, and encoded native label carry equations.

${'```'}mermaid
stateDiagram-v2
accTitle: $$accessible-title$$
accDescr {
  $$accessible-description$$
}
state "$$state-title$$" as TitleState
TitleState: $$state-body$$
PlainBox: $$plain-box$$
note right of TitleState: $$note-copy$$
TitleState --> PlainBox: $$edge-copy$$
SentinelBox: <br/> ﬂ°dollar¶ßﬂ°dollar¶ßsentinel-copyﬂ°dollar¶ßﬂ°dollar¶ß
class PlainBox vsﬂ°°45¶ßmermaid-source
${'```'}
{% /mermaid %}
`);
const journeyRoleTex = ['journey-title', 'journey-section', 'journey-task', 'journey-actor'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_journey" title="Journey formulas" question="Do journey roles retain their authored sources?" %}
The title, section, task, and shared actor legend carry equations.

${'```'}mermaid
journey
title $$journey-title$$
section $$journey-section$$
$$journey-task$$: 3: 10, 2, Actor $$journey-actor$$, Actor $$journey-actor$$
Plain follow-up: 4: 10
${'```'}
{% /mermaid %}
`);
const quadrantRoleTex = ['quadrant-title', 'quadrant-1', 'quadrant-2', 'quadrant-3', 'quadrant-4', 'quadrant-x-left', 'quadrant-x-right', 'quadrant-y-bottom', 'quadrant-y-top', 'quadrant-point-first', 'quadrant-point-second'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_quadrant" title="Quadrant formulas" question="Do every quadrant label and point retain its authored source?" %}
The title, quadrants, axes, and two points all carry equations.

${'```'}mermaid
quadrantChart
title $$quadrant-title$$
x-axis $$quadrant-x-left$$ --> $$quadrant-x-right$$
y-axis $$quadrant-y-bottom$$ --> $$quadrant-y-top$$
quadrant-1 "$$quadrant-1$$"
quadrant-2 "$$quadrant-2$$"
quadrant-3 "$$quadrant-3$$"
quadrant-4 "$$quadrant-4$$"
"$$quadrant-point-first$$": [0.15, 0.25]
"$$quadrant-point-second$$": [0.85, 0.75]
${'```'}
{% /mermaid %}
`);
const xyRoleTex = ['xy-title','xy-x','xy-y','xy-a','xy-b','xy-c','xy-line','xy-bar','xy-point-a','xy-point-b','xy-point-c'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_xy" title="XY formulas" question="Does every chart label retain its source?" %}
The title, categories, axes, legend, and line points carry equations.

${'```'}mermaid
xychart
title "$$xy-title$$"
x-axis "$$xy-x$$" ["$$xy-a$$","$$xy-b$$","$$xy-c$$"]
y-axis "$$xy-y$$" 0 --> 10
line "$$xy-line$$" [2 "$$xy-point-a$$",4 "$$xy-point-b$$",8 "$$xy-point-c$$"]
bar "$$xy-bar$$" [3,5,6]
${'```'}
{% /mermaid %}
`);
const sankeyRoleTex = ['sankey-a','sankey-b','sankey-c','sankey-encoded'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_sankey" title="Sankey formulas" question="Do flow labels retain their source?" %}
Repeated endpoints retain the first native node owner.

${'```'}mermaid
sankey
"$$sankey-a$$","$$sankey-b$$",3
"$$sankey-a$$","$$sankey-c$$",2
"$$sankey-b$$","$$sankey-c$$",1
"&dollar;&dollar;sankey-encoded&dollar;&dollar;<br/>","$$sankey-a$$",1
${'```'}
{% /mermaid %}
`);
const radarRoleTex = ['radar-title','radar-axis-a','radar-axis-b','radar-legend'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_radar" title="Radar formulas" question="Do polar labels retain their source?" %}
Duplicate axes remain distinct; a skipped curve still has a legend.

${'```'}mermaid
radar-beta:
title &dollar;&dollar;radar-title&dollar;&dollar;<br/>
axis same["$$radar-axis-a$$"],same["$$radar-axis-b$$"],plain
curve first["$$radar-legend$$"]{same:1,plain:2}
curve skipped {1,2}
${'```'}
{% /mermaid %}
`);
const requirementRoleTex = ['requirement-name','requirement-id',String.raw`\begin{matrix}a\\b\end{matrix}`,'requirement-element','requirement-type','requirement-doc'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_requirement" title="Requirement formulas" question="Do native rows retain exact source?" %}
A hidden duplicate is validated; visible rows retain their original equations.

${'```'}mermaid
requirementDiagram
requirement "need $$requirement-name$$" {
 id: "$$requirement-id$$"
 text: "$$\begin{matrix}a\\b\end{matrix}$$"
}
element "impl $$requirement-element$$" {
 type: "$$requirement-type$$"
 docRef: "&dollar;&dollar;requirement-doc&dollar;&dollar;<br/>"
}
requirement "need $$requirement-name$$" {
 text: "$$requirement-hidden$$"
}
"impl $$requirement-element$$" - satisfies -> "need $$requirement-name$$"
${'```'}
{% /mermaid %}
`);
const kanbanRoleTex = ['kanban-header-first','kanban-header-second',String.raw`\begin{matrix}a\\b\end{matrix}`,'kanban-ticket','kanban-assigned'];
const kanbanFormulaTex = [kanbanRoleTex[0],kanbanRoleTex[1],...kanbanRoleTex.slice(2).flatMap(tex=>[tex,tex,tex,tex])];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_kanban" title="Kanban formulas" question="Do duplicate card copies retain their exact source?" %}
Each formula has a distinct source role; duplicate column IDs create four card draws.

${'```'}mermaid
kanban
a["$$kanban-header-first$$"]
  i["$$\begin{matrix}a\\b\end{matrix}$$"]@{ticket: "$$kanban-ticket$$", assigned: "\u0024\u0024kanban-assigned\u0024\u0024"}
a["$$kanban-header-second$$"]
  j[Plain]
${'```'}
{% /mermaid %}
`);
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_info" title="Info authored formulas" question="Do hidden formulas remain validated?" %}

${'```'}mermaid
info
title $$info-hidden-old$$
title $$info-hidden-new$$
accTitle: $$info-access$$
accDescr: plain
${'```'}
{% /mermaid %}
`);
const erRoleTex = ['er-group',String.raw`\frac{1}{a}`,String.raw`\frac{1}{v}`,'er-role'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_er" title="ER formulas" question="Do entity, group and relationship equations retain their source?" %}

${'```'}mermaid
erDiagram
subgraph g["Group $$er-group$$"]
 A["$$\frac{1}{a}$$"] {
  string field "$$\frac{1}{v}$$"
 }
 B
end
A ||--|| B : "$$er-role$$"
${'```'}
{% /mermaid %}
`);
const swimlaneTex = [String.raw`\frac{1}{l}`,String.raw`\frac{1}{a}`,'swim-edge','swim-b'];
writeFileSync(index, readFileSync(index, 'utf8') + '\n' + String.raw`
{% mermaid id="math_swimlane" title="Swimlane formulas" question="Do lane, node and edge equations retain their source?" %}

${'```'}mermaid
swimlane-beta TB
subgraph lane["Lane $$\frac{1}{l}$$"]
 A["Node $$\frac{1}{a}$$"]
end
A -->|"Edge $$swim-edge$$"| B["Node $$swim-b$$"]
${'```'}
{% /mermaid %}
`);
copyFileSync(index, join(reportDir, 'fixture.md'));
run('check', index, '--release');
const original = join(repo, 'math.html');
run('export', index, '--out', original);
const relocated = join(reportDir, 'standalone.html'); copyFileSync(original, relocated);
const release = JSON.parse(readFileSync(join(root, 'dist/release/release.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { startedAt: new Date().toISOString(), node: process.version, cases: [], attempts: [], fileRequests: [], browser: '',
  release: release.version, toolkitSha256: sha(canonicalJSON(release)),
  sourceSha256: sha(readFileSync(index)), standaloneSha256: sha(readFileSync(relocated)),
  corpusSha256: sha(readFileSync(join(root, 'docs/validation/math-rendering/correctness-corpus.json'))),
  mathFingerprint: /visser-math-policy:([a-f0-9]{64})/.exec(readFileSync(join(root, 'dist/release/browser/math.js'), 'utf8'))?.[1],
};
const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
try {
  for (const [mode, width] of [['rendered',320], ['rendered',1440], ['source',320], ['worker-failure',320]]) {
    const js = mode !== 'source';
    const context = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => { report.attempts.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().startsWith('file:')) report.fileRequests.push(request.url()); });
    await page.addInitScript(() => { globalThis.__mathCsp = []; document.addEventListener('securitypolicyviolation', event => globalThis.__mathCsp.push(event.violatedDirective)); });
    if (mode === 'worker-failure') await page.addInitScript(() => { globalThis.Worker = class { constructor() { throw new Error('forced worker failure'); } }; });
    await page.goto(pathToFileURL(relocated).href);
    const pieFigure = page.locator('#x-math_pie');
    const timelineFigure = page.locator('#x-math_timeline');
    const flowchartFigure = page.locator('#x-math_flowchart');
    const collapsedFigure = page.locator('#x-math_collapsed');
    const sequenceFigure = page.locator('#x-math_sequence');
    const sequenceRolesFigure = page.locator('#x-math_sequence_roles');
    const stateFigure = page.locator('#x-math_state');
    const journeyFigure = page.locator('#x-math_journey');
    const sankeyFigure = page.locator('#x-math_sankey');
    const requirementFigure = page.locator('#x-math_requirement');
    const kanbanFigure = page.locator('#x-math_kanban');
    const erFigure = page.locator('#x-math_er');
    const swimlaneFigure = page.locator('#x-math_swimlane');
    const infoFigure = page.locator('#x-math_info');
    const radarFigure = page.locator('#x-math_radar');
    const xyFigure = page.locator('#x-math_xy');
    const quadrantFigure = page.locator('#x-math_quadrant');
    if (js) {
      await swimlaneFigure.locator('math').first().waitFor();
      assert.equal(await swimlaneFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.equal(await swimlaneFigure.getAttribute('data-vs-viewer-ready'), 'true');
      assert.deepEqual((await swimlaneFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...swimlaneTex].sort());
      await sequenceRolesFigure.locator('math').first().waitFor();
      assert.equal(await sequenceRolesFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await sequenceRolesFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-vs-mermaid-formula')))).sort(), [...sequenceRoleTex].sort());
      assert.equal(await sequenceRolesFigure.locator('math').count(), sequenceRoleTex.length);
      await sequenceFigure.locator('math').first().waitFor();
      assert.equal(await sequenceFigure.locator('math').count(), 2);
      assert.equal(await sequenceFigure.locator('[data-vs-mermaid-label="actor:SeqA:header"]').count(), 1);
      assert.equal(await sequenceFigure.locator('[data-vs-mermaid-label="actor:SeqA:footer"]').count(), 1);
      assert.equal(await sequenceFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.equal(await sequenceFigure.locator('svg .vs-mermaid-source, svg .vs-math').count(), 0);
      const isolatedClasses = sequenceFigure.locator('svg .mermaid-authored-vs-mermaid-source');
      assert.equal(await isolatedClasses.count(), 2);
      for (const shape of await isolatedClasses.all()) assert.ok(await shape.isVisible());
      await stateFigure.locator('math').first().waitFor();
      assert.equal(await stateFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await stateFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...stateRoleTex].sort());
      assert.equal(await stateFigure.locator('math').count(), stateRoleTex.length);
      assert.equal(await stateFigure.locator('svg .vs-mermaid-source, svg .vs-math').count(), 0);
      const isolatedStateClasses = stateFigure.locator('svg .mermaid-authored-vs-mermaid-source');
      assert.equal(await isolatedStateClasses.count(), 1);
      assert.ok(await isolatedStateClasses.first().isVisible());
      await journeyFigure.locator('math').first().waitFor();
      assert.equal(await journeyFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await journeyFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...journeyRoleTex].sort());
      assert.equal(await journeyFigure.locator('math').count(), journeyRoleTex.length);
      assert.deepEqual((await journeyFigure.locator('[data-vs-mermaid-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-label')))).sort(),
        ['title', 'section:0', 'task:0', 'task:1', 'actor:0', 'actor:1', 'actor:2'].sort());
      assert.equal(await journeyFigure.locator('svg .vs-mermaid-source, svg .vs-math').count(), 0);
      await requirementFigure.locator('math').first().waitFor();
      assert.equal(await requirementFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await requirementFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...requirementRoleTex].sort());
      assert.equal(await requirementFigure.locator('math').count(), requirementRoleTex.length);
      assert.deepEqual((await requirementFigure.locator('[data-vs-mermaid-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-label')))).sort(), ['requirement:0:name','requirement:0:id','requirement:0:text','element:0:name','element:0:type','element:0:docRef'].sort());
      await kanbanFigure.locator('math').first().waitFor();
      assert.equal(await kanbanFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await kanbanFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...kanbanFormulaTex].sort());
      assert.equal(await kanbanFigure.locator('math').count(), kanbanFormulaTex.length);
      assert.equal(await kanbanFigure.locator('[data-vs-mermaid-label]:has([data-vs-mermaid-formula])').count(), 14);
      assert.deepEqual((await kanbanFigure.locator('[data-vs-mermaid-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-label')))).sort(), [
        'kanban-render:0:0:section:label','kanban-render:1:3:section:label',
        ...[0,1].flatMap(section=>[1,2,4,5].flatMap(display=>['label','ticket','assigned'].map(role=>`kanban-render:${section}:${display}:item:${role}`))),
      ].sort());
      await erFigure.locator('math').first().waitFor();
      assert.equal(await erFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await erFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-vs-mermaid-formula')))).sort(), [...erRoleTex].sort());
      assert.equal(await erFigure.locator('math').count(),erRoleTex.length);
      await infoFigure.locator('svg text.version').waitFor();
      assert.deepEqual(JSON.parse(await infoFigure.getAttribute('data-vs-mermaid-source-map')).labels, []);
      assert.equal(await infoFigure.locator('math, [data-vs-mermaid-formula]').count(), 0);
      assert.equal(await infoFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.ok((await infoFigure.locator('svg text.version').textContent()).startsWith('v'));
      await radarFigure.locator('math').first().waitFor();
      assert.equal(await radarFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await radarFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...radarRoleTex].sort());
      assert.equal(await radarFigure.locator('math').count(), radarRoleTex.length);
      assert.deepEqual((await radarFigure.locator('[data-vs-mermaid-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-label')))).sort(), ['title','axis:0','axis:1','axis:2','curve:0','curve:1'].sort());
      await sankeyFigure.locator('math').first().waitFor();
      assert.equal(await sankeyFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await sankeyFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...sankeyRoleTex].sort());
      assert.equal(await sankeyFigure.locator('math').count(), sankeyRoleTex.length);
      assert.deepEqual((await sankeyFigure.locator('[data-vs-mermaid-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-label')))).sort(),
        ['node:0','node:1','node:2','node:3'].sort());
      await xyFigure.locator('math').first().waitFor();
      assert.equal(await xyFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await xyFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...xyRoleTex].sort());
      assert.equal(await xyFigure.locator('math').count(), xyRoleTex.length);
      assert.deepEqual((await xyFigure.locator('[data-vs-mermaid-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-label')))).sort(),
        ['title','xTitle','yTitle','category:0','category:1','category:2','series:0','series:1','point:0:0','point:0:1','point:0:2'].sort());
      await quadrantFigure.locator('math').first().waitFor();
      assert.equal(await quadrantFigure.locator('.vs-mermaid-notice').isVisible(), false);
      assert.deepEqual((await quadrantFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-formula')))).sort(), [...quadrantRoleTex].sort());
      assert.equal(await quadrantFigure.locator('math').count(), quadrantRoleTex.length);
      assert.deepEqual((await quadrantFigure.locator('[data-vs-mermaid-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-vs-mermaid-label')))).sort(),
        ['title', 'quadrant1', 'quadrant2', 'quadrant3', 'quadrant4', 'xLeft', 'xRight', 'yBottom', 'yTop', 'point:0', 'point:1'].sort());
      assert.deepEqual(await quadrantFigure.locator('[data-vs-mermaid-formula]').evaluateAll(nodes => nodes
        .filter(node => node.closest('[data-vs-mermaid-label]')?.getAttribute('data-vs-mermaid-label')?.startsWith('point:'))
        .map(node => [node.closest('[data-vs-mermaid-label]')?.getAttribute('data-vs-mermaid-label'), node.getAttribute('data-vs-mermaid-formula')]).sort()),
      [['point:0', 'quadrant-point-second'], ['point:1', 'quadrant-point-first']]);
      assert.equal(await quadrantFigure.locator('svg .vs-mermaid-source, svg .vs-math').count(), 0);
      await page.locator('#x-math_encoded math').waitFor();
      assert.equal(await page.locator('#x-math_encoded math').count(), 1);
      await flowchartFigure.locator('math').first().waitFor();
      assert.equal(await flowchartFigure.locator('math').count(), 4);
      await collapsedFigure.locator('math').first().waitFor();
      assert.equal(await collapsedFigure.locator('math').count(), 2);
      await timelineFigure.locator('math').first().waitFor();
      assert.equal(await timelineFigure.locator('math').count(), 4);
      await pieFigure.locator('math').first().waitFor();
      assert.equal(await pieFigure.locator('math').count(), 3);
      assert.equal(await pieFigure.locator('mfrac').count(), 1);
      assert.equal(await pieFigure.locator('mtr').count(), 2);
    } else {
      assert.ok(await sequenceFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await sequenceRolesFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await stateFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await journeyFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await quadrantFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await xyFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await sankeyFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await radarFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await requirementFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await kanbanFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await infoFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await erFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await swimlaneFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await flowchartFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await collapsedFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await timelineFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok(await pieFigure.locator('.vs-mermaid-source').isVisible());
      assert.ok((await pieFigure.locator('.vs-mermaid-source').textContent()).includes('\\\\frac{a}{b}'));
    }
    for (let i = 0; i < cases.length; i++) assert.equal(await page.locator(`#x-math_${i} .vs-math-source`).count(), 1);
    const expected = await page.locator('[data-vs-math-key]').count();
    if (mode === 'rendered') await page.waitForFunction(n => document.querySelectorAll('[data-vs-math-rendered]').length === n, expected, { timeout: 15000 });
    if (mode === 'worker-failure') await page.waitForSelector('.vs-math-notice');
    assert.equal(await page.locator('figure[data-vs-math-figure]').count(), 3);
    for (const figure of await page.locator('figure[data-vs-math-figure]').all()) {
      if (mode === 'rendered') assert.equal(await figure.getAttribute('data-vs-math-ready'), '');
      else assert.equal(await figure.locator('.vs-viewport').isVisible(), false);
      if (mode !== 'rendered') assert.ok(await figure.locator('.vs-lists').isVisible());
    }
    if (mode === 'rendered') {
      const longDisplay = page.locator('#x-long_equation .vs-math-display');
      assert.ok(await longDisplay.evaluate(node => node.scrollWidth > node.clientWidth));
      await longDisplay.focus(); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('#x-long_equation .vs-math-display').scrollLeft > 0, undefined, { timeout: 5000 });
      assert.equal(await longDisplay.locator('.vs-math-source').textContent(), '$$\n' + longTex + '\n$$');
      await page.getByRole('button', { name: 'Reference mode', exact: true }).click();
      await page.evaluate(() => {
        globalThis.__copiedMathReference = '';
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { globalThis.__copiedMathReference = text; } } });
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('#x-math_0 .vs-math-visual'));
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.locator('#x-math_0 .vs-math-visual').click();
      await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
      const copied = await page.evaluate(() => globalThis.__copiedMathReference);
      const packet = parseYaml(copied);
      assert.equal(packet.quote.exact, String.raw`$\frac{a}{b}$`);
      assert.equal(packet.quote.prefix.trim(), 'MC01:');
      assert.equal(packet.quote.suffix.trim(), '');
      assert.ok(!copied.includes('<svg') && !copied.includes('Copy LaTeX'), copied);
      // A partial generated reference contributes no source-owned quote.
      await page.evaluate(() => {
        const text = document.querySelector('#x-eq_intro .vs-eqref').firstChild;
        const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 8);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.locator('#x-eq_intro').click({ position: { x: 5, y: 5 } });
      assert.equal(await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).isDisabled(), true);
      await page.evaluate(() => {
        const range = document.createRange();
        range.setStart(document.querySelector('#x-eq_intro .vs-math-visual'), 0);
        range.setEnd(document.querySelector('#x-eq_intro .vs-eqref').firstChild, 8);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.locator('#x-eq_intro').click({ position: { x: 5, y: 5 } });
      await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
      const mixed = parseYaml(await page.evaluate(() => globalThis.__copiedMathReference));
      assert.equal(mixed.quote.exact.trim(), '$x$ and');
      assert.equal(mixed.quote.prefix.trim(), 'See');
      assert.equal(mixed.quote.suffix.trim(), '.');
      // A selected MathML glyph maps to its exact quoted-Mermaid source.
      await page.evaluate(() => {
        const glyph = document.querySelector('#x-math_pie mfrac mi');
        const range = document.createRange(); range.selectNodeContents(glyph);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.locator('#x-math_pie figcaption').click();
      await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
      const piePacket = parseYaml(await page.evaluate(() => globalThis.__copiedMathReference));
      assert.equal(piePacket.quote.exact, String.raw`$$\\frac{a}{b}$$`);
      assert.ok(piePacket.quote.prefix.endsWith('"Rate '));
      assert.ok(piePacket.quote.suffix.startsWith('" : 2'));
      const piePacketPath = join(reportDir, 'pie-reference.yaml');
      writeFileSync(piePacketPath, await page.evaluate(() => globalThis.__copiedMathReference));
      const resolvedPie = JSON.parse(run('refs', 'resolve', '--packet', piePacketPath, '--doc', index, '--json').stdout);
      assert.equal(resolvedPie.status, 'exact');
      assert.equal(resolvedPie.quoteFound, true);
      // Native flowchart MathML selects exact YAML escape spelling.
      await page.evaluate(() => {
        const glyph = document.querySelector('#x-math_flowchart [data-vs-mermaid-label="node:flow_b"] mi');
        const range = document.createRange(); range.selectNodeContents(glyph);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.locator('#x-math_flowchart figcaption').click();
      await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
      const flowchartPacket = parseYaml(await page.evaluate(() => globalThis.__copiedMathReference));
      assert.equal(flowchartPacket.quote.exact, String.raw`\u0024\u0024y\u0024\u0024`);
      const flowchartPacketPath = join(reportDir, 'flowchart-reference.yaml');
      writeFileSync(flowchartPacketPath, await page.evaluate(() => globalThis.__copiedMathReference));
      const resolvedFlowchart = JSON.parse(run('refs', 'resolve', '--packet', flowchartPacketPath, '--doc', index, '--json').stdout);
      assert.equal(resolvedFlowchart.status, 'exact');
      assert.equal(resolvedFlowchart.quoteFound, true);
      for (const tex of swimlaneTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_swimlane [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          const range = document.createRange(); range.selectNodeContents(formula.querySelector('mi,mn,mo'));
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await swimlaneFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, '$$' + tex + '$$');
        const packetPath = join(reportDir, 'swimlane-reference.yaml');
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact');
        assert.equal(resolved.quoteFound, true);
      }
      for (const position of ['header', 'footer']) {
        await page.evaluate(position => {
          const glyph = document.querySelector(`#x-math_sequence [data-vs-mermaid-label="actor:SeqA:${position}"] mi`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, position);
        await sequenceFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, String.raw`\u0024\u0024x\u0024\u0024`);
        const packetPath = join(reportDir, `sequence-${position}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact');
        assert.equal(resolved.quoteFound, true);
      }
      for (const tex of [...new Set(sequenceRoleTex)]) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_sequence_roles [data-vs-mermaid-formula]')].find(node=>node.getAttribute('data-vs-mermaid-formula')===tex);
          const glyph = formula.querySelector('mi,mo,mn');
          const range=document.createRange();range.selectNodeContents(glyph);
          const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        },tex);
        await sequenceRolesFigure.locator('figcaption').click();
        await page.getByRole('button',{name:'Copy reference with selected text',exact:true}).click();
        const packetText=await page.evaluate(()=>globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, `$$${tex}$$`);
        const packetPath=join(reportDir,'sequence-role-reference.yaml');writeFileSync(packetPath,packetText);
        const resolved=JSON.parse(run('refs','resolve','--packet',packetPath,'--doc',index,'--json').stdout);
        assert.equal(resolved.status,'exact');assert.equal(resolved.quoteFound,true);
      }
      for (const tex of stateRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_state [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing state formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing state glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await stateFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        const packet = parseYaml(packetText);
        const expectedSource = tex === 'sentinel-copy'
          ? 'ﬂ°dollar¶ßﬂ°dollar¶ßsentinel-copyﬂ°dollar¶ßﬂ°dollar¶ß'
          : `$$${tex}$$`;
        assert.equal(packet.quote.exact, expectedSource);
        const packetPath = join(reportDir, `state-${tex}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      for (const tex of journeyRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_journey [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing journey formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing journey glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await journeyFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, `$$${tex}$$`);
        const packetPath = join(reportDir, `journey-${tex}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      for (const tex of quadrantRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_quadrant [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing quadrant formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing quadrant glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await quadrantFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, `$$${tex}$$`);
        const packetPath = join(reportDir, `quadrant-${tex}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      for (const tex of sankeyRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_sankey [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing sankey formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing sankey glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await sankeyFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, tex === 'sankey-encoded' ? '&dollar;&dollar;sankey-encoded&dollar;&dollar;' : `$$${tex}$$`);
        const packetPath = join(reportDir, `sankey-${tex}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      for (const tex of radarRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_radar [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing radar formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing radar glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await radarFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, tex === 'radar-title' ? '&dollar;&dollar;radar-title&dollar;&dollar;' : `$$${tex}$$`);
        const packetPath = join(reportDir, `radar-${tex}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      for (const tex of requirementRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_requirement [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing requirement formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing requirement glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await requirementFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, tex === 'requirement-doc' ? '&dollar;&dollar;requirement-doc&dollar;&dollar;' : `$$${tex}$$`);
        const packetPath = join(reportDir, `requirement-${sha(tex).slice(0,16)}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      for (const tex of kanbanRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_kanban [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing kanban formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing kanban glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await kanbanFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        const expectedSource = tex === 'kanban-assigned' ? String.raw`\u0024\u0024kanban-assigned\u0024\u0024` : `$$${tex}$$`;
        assert.equal(parseYaml(packetText).quote.exact, expectedSource);
        const packetPath = join(reportDir, `kanban-${sha(tex).slice(0,16)}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      for (const tex of xyRoleTex) {
        await page.evaluate(tex => {
          const formula = [...document.querySelectorAll('#x-math_xy [data-vs-mermaid-formula]')].find(node => node.getAttribute('data-vs-mermaid-formula') === tex);
          if (!formula) throw new Error(`missing xy formula ${tex}`);
          const glyph = formula.querySelector('mi,mo,mn');
          if (!glyph) throw new Error(`missing xy glyph ${tex}`);
          const range = document.createRange(); range.selectNodeContents(glyph);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }, tex);
        await xyFigure.locator('figcaption').click();
        await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
        const packetText = await page.evaluate(() => globalThis.__copiedMathReference);
        assert.equal(parseYaml(packetText).quote.exact, `$$${tex}$$`);
        const packetPath = join(reportDir, `xy-${tex}-reference.yaml`);
        writeFileSync(packetPath, packetText);
        const resolved = JSON.parse(run('refs', 'resolve', '--packet', packetPath, '--doc', index, '--json').stdout);
        assert.equal(resolved.status, 'exact'); assert.equal(resolved.quoteFound, true);
      }
      // Mixed label text cannot silently reuse the preceding formula quote.
      await page.evaluate(() => {
        const label = document.querySelector('#x-math_pie [data-vs-mermaid-label="section:0"] div');
        const glyph = label.querySelector('mfrac mi');
        const range = document.createRange(); range.setStart(label.firstChild, 0); range.setEnd(glyph.firstChild, 1);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.locator('#x-math_pie figcaption').click();
      assert.ok(await page.getByRole('button', { name: 'Copy reference with selected text', exact: true }).isDisabled());
      assert.ok(await page.getByText('To copy this selection accurately, show the diagram source and select the text there.', { exact: true }).isVisible());
      await page.keyboard.press('Escape');
      const refMode = page.getByRole('button', { name: 'Reference mode', exact: true });
      if (await refMode.getAttribute('aria-pressed') === 'true') await refMode.click();
      await page.locator('#x-math_terms [data-vs-term]').focus();
      await page.waitForSelector('.vs-tooltip [data-vs-math-rendered]');
      assert.equal(await page.locator('.vs-tooltip code').textContent(), '$literal$');
      assert.equal(await page.locator('.vs-tooltip .vs-math-source').textContent(), '$x^2$');
      assert.ok(!(await page.locator('.vs-tooltip__text').textContent()).includes('second sentence'));
      await page.keyboard.press('Escape');
      await page.locator('#x-math_terms .vs-cite').focus();
      await page.waitForSelector('.vs-tooltip [data-vs-math-rendered]');
      assert.equal(await page.locator('.vs-tooltip .vs-math-source').textContent(), '$x_i$');
      await page.keyboard.press('Escape');
      await page.locator('#x-math_terms .vs-cite').click();
      await page.waitForSelector('.vs-inspector__title [data-vs-math-rendered]');
      assert.equal(await page.locator('.vs-inspector__title .vs-math-source').textContent(), '$x_i$');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      const duplicateIds = await page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
        return ids.filter((id, i) => ids.indexOf(id) !== i);
      });
      assert.deepEqual(duplicateIds, []);
    }
    assert.equal(await page.locator('#x-energy').count(), 1);
    assert.equal(await page.locator('a.vs-eqref').textContent(), 'Equation (1)');
    const csp = js ? await page.evaluate(() => globalThis.__mathCsp) : [];
    assert.deepEqual(csp, []); assert.deepEqual(errors, []);
    await page.screenshot({ path: join(reportDir, `${mode}-${width}.png`), fullPage: true });
    await page.emulateMedia({ media: 'print' });
    assert.ok(await pieFigure.locator('.vs-mermaid-source').isVisible());
    // Responsive cards and inspector copies may be hidden; every expression must
    // retain at least one visible source occurrence in the printed document.
    const printed = new Map();
    assert.ok(await sequenceFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await sequenceRolesFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await stateFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await journeyFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await quadrantFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await xyFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await sankeyFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await radarFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await requirementFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await kanbanFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await infoFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await erFigure.locator('.vs-mermaid-source').isVisible());
    assert.ok(await swimlaneFigure.locator('.vs-mermaid-source').isVisible());
    for (const source of await page.locator('.vs-math-source').all()) {
      const text = await source.textContent();
      printed.set(text, printed.get(text) || await source.isVisible());
    }
    for (const [text, visible] of printed) assert.ok(visible, `No printed source for ${text}`);
    for (const figure of await page.locator('figure[data-vs-math-figure]').all()) {
      assert.ok(await figure.locator('.vs-lists').isVisible());
      assert.equal(await figure.locator('.vs-viewport').isVisible(), false);
    }
    const printWidth = await page.locator('#x-long_equation .vs-math-source').evaluate(node => ({ width: node.getBoundingClientRect().width, viewport: document.documentElement.clientWidth, height: node.getBoundingClientRect().height }));
    assert.ok(printWidth.width <= printWidth.viewport && printWidth.height > 40, JSON.stringify(printWidth));
    await page.pdf({ path: join(reportDir, `${mode}-print.pdf`), width: '100mm', height: '150mm', printBackground: true });
    report.cases.push({ mode, width, js, expressions: expected, csp, errors, selectionCopy: mode === 'rendered' ? 'passed' : 'not applicable', mermaidSelection: mode === 'rendered' ? 'exact source and stale-quote clearing passed' : 'not applicable', printSource: 'passed', passed: true });
    await context.close();
  }
  const fallbackContext = await browser.newContext({ viewport: { width:320, height: 850 } });
  await fallbackContext.route(/^https?:/, route => { report.attempts.push(route.request().url()); return route.abort(); });
  const fallbackPage = await fallbackContext.newPage();
  fallbackPage.on('request', request => { if (request.url().startsWith('file:')) report.fileRequests.push(request.url()); });
  await fallbackPage.addInitScript(() => { Object.defineProperty(window, 'MathMLElement', { configurable: true, value: undefined }); });
  await fallbackPage.goto(pathToFileURL(relocated).href);
  await fallbackPage.locator('#x-math_pie .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_pie .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_pie math').count(), 0);
  assert.ok(await fallbackPage.locator('#x-math_flowchart .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_flowchart math').count(), 0);
  await fallbackPage.locator('#x-math_encoded .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_encoded .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_encoded math').count(), 0);
  await fallbackPage.locator('#x-math_sequence .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_sequence .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_sequence math').count(), 0);
  await fallbackPage.locator('#x-math_sequence_roles .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_sequence_roles .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_sequence_roles math').count(), 0);
  await fallbackPage.locator('#x-math_state .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_state .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_state math').count(), 0);
  await fallbackPage.locator('#x-math_journey .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_journey .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_journey math').count(), 0);
  await fallbackPage.locator('#x-math_quadrant .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_quadrant .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_quadrant math').count(), 0);
  await fallbackPage.locator('#x-math_requirement .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_requirement .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_requirement math').count(), 0);
  await fallbackPage.locator('#x-math_swimlane .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_swimlane .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_swimlane math').count(),0);
  await fallbackPage.locator('#x-math_er .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_er .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_er math').count(),0);
  await fallbackPage.locator('#x-math_info .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_info .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_info math').count(),0);
  await fallbackPage.locator('#x-math_kanban .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_kanban .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_kanban math').count(), 0);
  await fallbackPage.locator('#x-math_radar .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_radar .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_radar math').count(), 0);
  await fallbackPage.locator('#x-math_sankey .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_sankey .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_sankey math').count(), 0);
  await fallbackPage.locator('#x-math_xy .vs-mermaid-notice').waitFor();
  assert.ok(await fallbackPage.locator('#x-math_xy .vs-mermaid-source').isVisible());
  assert.equal(await fallbackPage.locator('#x-math_xy math').count(), 0);
  report.cases.push({ mode: 'mathml-unavailable', passed: true });
  await fallbackContext.close();
  assert.deepEqual(report.attempts, []);
  assert.ok(report.fileRequests.every(url => url === pathToFileURL(relocated).href), JSON.stringify(report.fileRequests));
} finally { await browser.close(); writeFileSync(join(reportDir, 'standalone.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(`Math standalone checks passed; evidence in ${reportDir}`);
