# Improvements: catalogue clarity, colour, depth on click, and a domain component

Date: 27 September 2026. Branch: `explain-plan`. Toolkit: `dist/release` at
commit `ab5eec8`.

This document proposes changes to the component catalogue, the visual style,
the reader interface, and the authoring skill. It is a proposal, not a
specification change. Each section states the finding, the evidence, and the
change. Section 9 gives the order of work. Section 10 lists open questions.

## Inputs

- `skills/visser-visual-explain/SKILL.md` and the 10 catalogue guides.
- `packages/runtime/src/reader.css`, `reader.ts`, `mermaid.ts`, and
  `packages/core/src/compiler/svg.ts`.
- `docs/ARCHITECTURE.md` §9, §10, §14.
- The Penpot file "Visser": the Foundations, Principles, Reader UI, Catalogue
  components (light and dark), and Page layouts pages.
- Five examples built with `--dev-toolkit dist/release` and read at 1440 px
  and 390 px: `order-intake`, `cache-stampede`, `schema-migration`,
  `image-pipeline`, `mermaid-er`. Screenshots are in
  `docs/validation/improvements-1/`.
- The project goals. Documents are terse. A picture replaces a thousand
  words. A term shows its definition on hover. Depth is one click away. An
  LLM can read the document, and it is small on disk. The look is
  hand-written.

## Decisions taken with the user before this document

| Question | Decision |
|---|---|
| Colour policy | Semantic colour, always paired with a shape, pattern, or text cue, and only where it adds value. |
| Domain model | A new `domain` component, not a reuse of `architecture`. |
| Lists under a figure on wide screens | Move them behind a toggle. The drawing is the main view. |
| Mermaid | Demote it: keep the tag, remove it from the skill's component list, prompt on every use, and move it to an opt-in extension in a later release. (A split into typed components was chosen first, then withdrawn after the size and usage numbers below.) |

## 1. Findings

### F1. Colour carries no information

Every node, event, stage, factor, and task is a white box with a grey stroke.
`role` (interface, process, storage, external, decision, concept), edge `kind`,
task `status`, and factor `basis` are text only. The Penpot principles page
makes this a rule: "4. One accent; everything else is ink", with "colour-coded
roles" as a DON'T. The Penpot node board says: "Role (process, storage…) is a
class only: no visual difference today."

Evidence: `order-intake-architecture.png`. A reader cannot tell the queue from
the API without reading each label and the list below.

Cost: a reader scans a figure by preattentive cues (hue, shape, line pattern)
before they read. A figure with one cue set gives the reader nothing to scan.

### F2. The page states each figure three times

On a wide screen a figure shows the drawing, a node list, and an edge list.
Then a "Details and evidence" appendix repeats every part as one collapsed
row. The `order-intake` example has 3 figures and a 30-row appendix. The rows
have names such as "Order API node" and "take next request edge", and each
row holds one sentence.

Evidence: `order-intake-wide.png`. The page is 4,649 px tall for 1,700 words.

Cost: the reader cannot find the main path. The repetition is the opposite of
"terse".

### F3. Depth on click is thin

A click on a node opens the inspector with the role and one sentence
(`order-intake-inspector.png`). It does not show the node's edges, the trace
events that reuse the node through `entity`, or the evidence. A click on an
edge shows its body. Nothing dims the rest of the figure to show a
neighbourhood.

Cost: the interactive layer does not carry the depth. The static layer carries
it, which is why the page is cluttered (F2).

### F4. Text inside boxes repeats what shape and colour can say

A trace event box shows the label, then `[state-change]`, then
`branch: Charge succeeds`. A task box shows `status: ready`. A factor shows its
basis as a second line. The boxes grow, the layout grows, and the
`schema-migration` plan needs 640 px of height for 5 tasks.

### F5. The catalogue is clear, except at the Mermaid boundary

The guides answer "use it when" and "do not use it when" well. Each guide
states the pair that readers confuse:

- architecture and trace: order;
- trace and state: one run and all runs;
- architecture and transform: components and representations;
- plan and state: steps and states;
- cause and trace: timing.

The weak boundary is `mermaid`. One entry covers flowchart, sequence, state,
ER, class, Gantt, and more. Three of those types overlap a catalogue component
(flowchart with `architecture`, sequence with `trace`, state with `state`). An
agent that knows Mermaid will reach for it first. The guide says "quick flow
where per-edge evidence is not needed", which every author believes of their
own figure. Section 6 gives the usage and size numbers.

### F6. Mermaid renders in a foreign theme

`mermaid.ts` sets `theme: 'default'`. The ER figure is purple on white in a
page whose only accent is blue (`mermaid-er-wide.png`). The ER and class
diagrams are one target, so the reader cannot inspect an entity.

### F7. There is no domain model

A document that introduces 3 or more unfamiliar terms has no place to show
the terms together, or how they relate. `definition` blocks render only in the
appendix. A term in prose gets a dotted underline and a tooltip. The reader
meets the terms one at a time, in reading order, with no map.

### F8. Small layout faults

- Trace branch headings overlap: "Charge succeeds" and "Charge declined" draw
  over each other at the fork (`order-intake-trace.png`).
- The order-layer number appears on the axis and again beside every box.
- `compare` shows a "details" link in every cell (dogfood-2 Q5, still open).
- A node label wraps at 170 px; "Marks the order payment-failed" takes 3 lines.
- The library in Penpot has 0 colours, 0 typographies, and 0 tokens. The
  colour swatches on the Foundations board are plain rectangles.

## 2. Two principles to revise

### 2.1 Replace "One accent; everything else is ink"

New wording for Penpot principle 4 and `reader.css` §10:

> **Accent marks action. Category hue marks one variable per figure.**
> The accent (blue) means "you can act on this": links, the primary button,
> focus, selection. A figure encodes at most one variable in hue: the
> variable that its `question` asks about. Every hue is paired with a shape,
> a line pattern, or a text cue, so the figure survives greyscale and forced
> colours. A figure whose encoded variable has one value shows no hue.

The last sentence is the "only when it adds value" rule. Colour appears only
when it separates things.

### 2.2 Add "Depth is one click away; the main view carries the path"

> The main view shows the label of each part and the relationships between
> them. Everything else (kind, basis, status text, body, evidence, related
> parts) is one click or one hover away, in the inspector or a tooltip. The
> text list and the appendix keep the full content for readers without
> JavaScript, for print, for search, and for the Markdown projection. They do
> not compete with the drawing on a wide screen.

This is the rule that lets interactivity reduce clutter instead of adding to it.

## 3. Colour and figure style

### 3.1 Palette tokens

Add six category hues to `reader.css`, each with a light and a dark value.
A stroke on `--vs-bg` or `--vs-panel` needs a contrast ratio of 3 or more.
Text on a tinted fill needs a ratio of 4.5 or more. Blue is reserved for the
accent, so the categories avoid it.

| Token | Light stroke | Light fill (tint) | Dark stroke | Meaning is assigned per family (3.2) |
|---|---|---|---|---|
| `--vs-cat-teal` | `#0F766E` | `#E6F4F2` | `#5EEAD4` | |
| `--vs-cat-amber` | `#B45309` | `#FDF1E1` | `#FBBF24` | |
| `--vs-cat-violet` | `#6D28D9` | `#F0EAFB` | `#C4B5FD` | |
| `--vs-cat-green` | `#15803D` | `#E7F5EC` | `#86EFAC` | |
| `--vs-cat-rose` | `#BE123C` | `#FCE8EE` | `#FDA4AF` | |
| `--vs-cat-slate` | `#475569` | `#EEF1F5` | `#CBD5E1` | |

Rules:

- A category fill is a tint (about 8% of the hue on white). The stroke carries
  the full hue. Text inside a tinted box stays `--vs-fg`.
- `--vs-danger` stays for failure. It is the same hue family as `rose`, so a
  family that uses rose for a category must not also show failure.
- Add the six tokens to the Penpot library as colours and as design tokens,
  and rebuild the Foundations swatches from them. The library is empty today.
- Add the same values to the forced-colours block: fill `Canvas`, stroke
  `CanvasText`, and keep the shape and pattern cues.

### 3.2 What each family encodes in hue

One variable per family. The paired cue is mandatory.

| Family | Variable in hue | Values and paired cue | Not in hue |
|---|---|---|---|
| `architecture` | node `role` | interface: teal, pill corners (radius 12). process: slate, radius 6. storage: amber, a second bottom line (drum). external: violet, dashed stroke. decision: green, chamfered corners. concept: no fill, dotted stroke. | edge `kind` (line pattern: call solid, data dashed, control dotted, feedback with a loop marker). |
| `trace` | event `kind`, failure and wait only | failure: danger stroke 2 px and a "✕" mark in the box corner, plus the word in the list. wait: amber, dashed stroke. All other kinds: ink. Exclusive branches: neutral bands (panel and background alternate) behind the sub-columns, so the figure has one hue variable. A time-scale trace keeps "at T" in the box. | actor (position is enough). |
| `state` | none by default | initial: filled dot marker. terminal: double ring. A transition with `basis` other than observed: line pattern as in cause. | guard and action text (inspector and list). |
| `cause` | `basis` of factors and links | observed: ink, solid. inferred: amber, dashed 6 4, word "inferred" in the list. hypothesis: violet, dotted 2 4. stipulated: slate, dash-dot. | outcome (position). |
| `plan` | task `status` | complete: green, check marker. ready: teal, solid. blocked: amber, dashed stroke (6 4). proposed: slate, no fill, dotted stroke (2 4). unknown: no fill, "?" marker. Every status now differs in shape or pattern as well as hue. | dependency `kind` (line pattern); `due` (text under the label, see 4.4). |
| `transform` | conversion `loss` | a conversion with `loss`: amber line and label, and the word "loss" stays in the label. Everything else: ink. | `location` and representation (text in the box). |
| `compare` | none | `valueStatus` stays a text badge. A missing cell is muted italic. | |
| `annotated` | none | annotation markers use the accent, because they are actions. | |
| `domain` (new) | concept `category` | see section 5. | |

The reason for "none" in three families: their question is not about a
categorical variable. A hue there decorates and does not inform. In `transform`
the one coloured fact is the lossy step, because the guide names it as the
point of the figure. Location stays as text.

Edge patterns need a key too. A legend (3.3) lists a pattern chip for each
edge `kind`, transition `basis`, or dependency `kind` that the figure uses,
and an edge's aria-label carries the same word.

### 3.3 Legend

When a figure uses 2 or more values of its hue variable, the compiler renders
a legend line under the interpretation paragraph. The legend is a row of
chips. Each chip is a swatch with the paired cue and the value word
("storage", "inferred", "blocked"). The legend is static HTML, so it prints
and works without JavaScript. The text list and the Markdown projection keep
the value words, so the legend adds nothing that they lack.

Add one Penpot component `figure-part / legend` with variants per family.

### 3.4 Box content

A box shows its label only. The kind, status, and basis leave the box and move
to the paired cue, the legend, the list, and the inspector. Exceptions:

- A trace event with `to` keeps "→ Receiver" as a second line. On a narrow
  screen the arrow alone does not name the receiver.
- A transform stage keeps `representation` and `location`, because they are
  the point of the figure.
- A time-scale trace event keeps "at T", and a task keeps its `due` date.
  Both are the fact the figure exists to show.

Expected effect: node width can go to 150 px and height to two lines. The
`schema-migration` plan drops from 640 px to about 420 px.

### 3.5 Mermaid theme

Set `theme: 'base'` in `mermaid.ts`. Read `themeVariables` from the page
tokens at render time:

- `primaryColor` = `--vs-panel`;
- `primaryBorderColor` and `lineColor` = `--vs-line`;
- `fontFamily` = `--vs-font`;
- `fontSize` = 14 px.

Dark mode follows the tokens. The purple goes away.

### 3.6 Hand-written look

The pages look generated because every box has the same size, stroke, radius,
and fill. The changes in 3.2 and 3.4 remove most of that. Two more:

- Use the figure `title` as the figure heading and drop the "Figure" eyebrow.
  Put the eyebrow text in the `aria-label`.
- Let the interpretation paragraph sit beside the legend, not above the
  drawing, when both are short (one line each).

Do not add a hand-drawn stroke style. It reads as a joke in an incident review.

## 4. Depth on click, clutter off the page

### 4.1 Lists behind a toggle on wide screens

On a screen 900 px or wider with JavaScript, a figure shows the drawing and a
"Show as list" button in the view bar. The node list and the edge list are in
the DOM with `hidden`, and the button toggles them. Without JavaScript, in
print, and on narrow screens the lists stay visible as today. The Markdown
projection is unchanged.

`reader.css`: the existing `.vs-view-bar` and `.vs-view-list` rules extend to
wide screens under `.vs-js`.

### 4.2 A richer inspector

When the inspector opens on a part, it shows, in this order:

1. The label and the paired-cue word (for example "Charge queue · storage").
2. The body.
3. **Relationships**: incoming and outgoing edges, transitions, conversions,
   or dependencies, each as "→ label → Other part", clickable. This is the
   data that `relationships()` already emits.
4. **Appears in**: trace actors, nodes in other figures, and concepts that
   reference this part through `entity` or `definition`.
5. **Evidence**, collapsed and last: each cited source, excerpt first, with the
   origin line. A sources-only target first shows direct source links, then the
   same collapsed excerpts.
6. The "Copy reference" action.

The heading names the drill-down depth: Explanation, Additional context, or
Sources. Back names its destination. Locate reveals and focuses the visible
instance and the page marks every instance of the inspected target.

For a source, the order stays as the Penpot inspector board shows (excerpt,
origin, Provenance collapsed).

### 4.3 Neighbourhood on hover and focus

When the pointer rests on a node, or when the node has keyboard focus, the
runtime marks the figure. Each edge and node that is not adjacent gets
`vs-dim`. Each adjacent one gets `vs-near`. `vs-dim` sets opacity 0.35. This
is the cheapest way to answer "what does this part talk to" without a click.
It is a hover enhancement only. Nothing depends on it, and the inspector
holds the same data for touch screens.

### 4.4 Evidence on a part, not only in prose

Add an optional `evidence` attribute (an array of `source` IDs) to `node`,
`event`, `state`, `stage`, and `task`, as `causal-link` has today. A click on
the part opens useful explanation and context before a collapsed evidence
excerpt. This is the "click a step to see the code" behaviour from the project goals. `check` validates the IDs
as `E_REF_BROKEN`, and `W_EVIDENCE_GAP` can count parts without evidence in a
root-cause document.

`cite` in a part body stays. The two have different meanings, and the guides
state the rule: `evidence` names the source that shows this part (for a
node or event, the code; for a task, the source of its `due` date; for a
state or stage, the code that defines it). `cite` supports one sentence in
the body. A link-only source is allowed in `evidence`, as it is in `cite`,
and the inspector says so in the same words as the appendix. In a root-cause
document, a part whose sources are all link-only counts as a part without
evidence. The inspector lists `evidence` sources first, then the
cited ones. `evidenceIds` (§9.2) is the union of both, as today.

A compare `cell` also accepts `evidence` under §4.6. It supports the displayed
value or explanation and enables inspection when the excerpt adds information.

`task` also gains an optional `due` date (ISO 8601). A `due` without
`evidence` is `W_EVIDENCE_GAP`. The date renders as text under the label,
never as a bar length, so the plan stays a dependency graph. This replaces the
one use of Mermaid Gantt that `plan` did not cover.

### 4.5 The appendix

- Group the figure parts of one figure inside one `details` row: "Parts of
  'Accepting and charging are separate responsibilities' (11)". Sources and
  Definitions come first, open by default, as the Penpot layout shows.
- Name a part row by its label and its cue word: "Charge queue · storage",
  not "Charge queue node".
- Skip the normal drill-down for a part whose canonical detail adds nothing
  beyond that instance. It remains a target for references. Keep a row when
  generated relationships, appearances, Mermaid structure, or sources add
  useful information.

### 4.6 Compare cells

Show an inspection link only when the inspector holds more than the table or
card shows. For a cell with `value`, additional content is a body block,
evidence, a `cite`, or a nested `detail`. For a cell without `value`, the first
body block is the displayed value, so an additional block also enables the
link. A cell whose inspector only repeats its displayed value gets no link.
Render the link for a body-only cell as the shared depth cue inline after the
text, with the action in the `aria-label`. A non-interactive cell keeps its
target identity (§10.3) on its displayed value, body, or option label.

### 4.8 Drill-down depth and value

The compiler classifies a target as explanation, generated context,
sources-only, or bare. Each rendered instance subtracts facts already visible
there. Explanation and context use the same two-bar cue because both promise
more understanding. Sources-only uses one muted bar. Bare instances are not
links. A short static key explains the bars; the About panel owns it when the
runtime is active.

`check --review` emits one `W_DETAIL_VALUE` for a figure when sources-only
drill-downs are at least as numerous as targets with explanation or additional
context. The prompt asks for mechanisms, invariants, constraints, contrasts,
failure behaviour, or consequences where readers need more than provenance.

### 4.7 Tooltips on edges

An edge label on hover shows the edge body as the same tooltip that a term
uses. Terms already have this. Edges do not.

## 5. The `domain` component

### 5.1 Question

Which things does this document talk about, what does each mean, and how do
they relate?

### 5.2 Use it when

- The document introduces 3 or more terms that the reader profile does not
  list under `knows`.
- Two terms are easy to confuse (target and reference, packet and lock).
- A later figure uses the terms as node labels, and the reader must see them
  once, together, before the mechanism.

Do not use it when one paragraph and inline `term` links are enough, or when
the point is who calls whom (use `architecture`).

### 5.3 Tags

| Tag | Required | Optional |
|---|---|---|
| `domain` | `id`, `title`, `question` | — |
| `concept` | `id`, `label`, `definition` | `category`, `attributes`, `entity` |
| `relation` | `id`, `from`, `to`, `kind`, `label` | `cardinality` |

- `definition` names a `definition` block and is required. A box on the map
  is a term worth one sentence, also when the reader profile knows it. The
  concept inherits the first sentence as its tooltip and its list text. One
  definition, one owner.
- `category`: `thing`, `actor`, `event`, `value`, `rule`. The hue follows
  the category: thing slate, actor teal, event amber, value green, rule
  violet. The shape cue also follows it: actor pill, event chamfer, value
  double outline with no fill, rule dotted. These cues remain in forced colours.
- `attributes`: a list of short strings, shown in the box under the label
  (`["id", "state"]`).
- `entity`: an architecture `node` that this concept is. A later figure can
  then reuse the concept.
- `relation kind`: `is-a`, `has`, `uses`, `produces`, `identifies`. Each
  kind has a line pattern. `is-a` ends in a hollow triangle. `has` has a
  filled diamond at the owner. `uses` is dashed. `produces` is solid with an
  arrow. `identifies` is dotted.
- `cardinality`: a string such as `1..*`, drawn in the relation label after
  a middle dot ("contains · 1..*"). An end label collides when two relations
  end on one side, so the label carries it.

### 5.4 Rendering

Wide: a compact map (ELK, layered, same kernel as `architecture`) with the
glossary as a table to the right when the window allows, else below. The map
and the glossary form one row centred on the text column, never wider than
the window minus 4 rem. The map keeps its natural width, and the glossary
takes 20 to 40 rem. The layout stays left to right unless the map is wider
than 1100 px or a top-to-bottom layout costs less height with the glossary
counted. The glossary rows are: term, the category word in muted text, the
one-sentence definition (computed once in the build and shared with the
tooltip), "read more" into the inspector. Narrow: the glossary table first, the map behind "Show map". Text
projection: the glossary, then each relation as "Order has Invoice line
(1..*)".

A `term` in prose that refers to a definition owned by a concept gets the
same tooltip. A click on it opens the inspector on the concept. The inspector
shows the definition, the relations, and where the concept appears.

### 5.5 Template

```markdown
{% definition id="def_target" term="target" %}
A target is one addressable block or figure part with a stable ID.
{% /definition %}

{% definition id="def_packet" term="reference packet" %}
A reference packet names one target by document ID, target ID, and revision.
{% /definition %}

{% domain id="terms" title="A packet names a target" question="Which things does this document talk about, and how do they relate?" %}
Read this once; every later figure uses these words.

{% concept id="c_target" label="Target" definition="def_target" category="thing" attributes=["id", "revision"] /%}
{% concept id="c_packet" label="Reference packet" definition="def_packet" category="value" /%}

{% relation id="r_names" from="c_packet" to="c_target" kind="identifies" label="names exactly one" cardinality="1" /%}
{% /domain %}
```

### 5.6 Where it goes

The skill's step 3 ("sketch the mental model") gains one sentence: "If the
sketch names 3 or more terms the reader does not know, consider a `domain`
first." `W_JARGON` gains a suggestion: "3 undefined terms; consider a
`domain` figure." The agent decides. No document kind requires a domain. A
user request for one overrides the agent's call.

This component replaces the explanatory use of Mermaid ER and class diagrams
(section 6). Its parts are targets, so a reader can inspect an entity, which
the Mermaid ones cannot offer.

## 6. Demote `mermaid` and plan its removal

### 6.1 Why

- No authored document uses it. `how-visser-works` and
  `life-of-a-target-id` have 0 Mermaid figures. The 5 `examples/mermaid-*`
  bundles exist to test it.
- It is the largest part of the release: `browser/mermaid.js` is 5,575,485
  bytes (1,608,869 gzip) and `workers/mermaid-parse.cjs` is 12 MB. The reader
  itself is a few hundred kilobytes. It is the one exception to §2.3.
- It breaks four product rules. It renders in the browser, so a build is not
  byte-identical (§7.5). ER, class, and Gantt figures are one target, so no
  part is inspectable and no edge carries evidence (§9.2). It has its own
  security surface: 10 of the `E_UNSAFE_CONTENT` rules in `format.md` §8
  exist only for it (§15.2). It themes itself in purple (F6).
- Its overlap is its failure mode. Flowchart, sequence, and state are the
  three types an author reaches for first, and each has a stronger native
  component (F5).
- After `domain` exists (section 5), the unique remainder is Gantt (which
  `plan` rejects by design), pie, timeline, mindmap, and quadrant. §9.11
  already places decorative panels outside the catalogue. These sit close to
  that line.

The value it keeps: familiar notation, fast to type, and a long tail of types.
An extension can keep that value for the authors who need it.

### 6.2 Now: demote

1. Remove the `mermaid` bullet from SKILL.md step 4. Replace it with one
   sentence at the end of the step: "Mermaid is an escape hatch; `visser
   catalogue show mermaid` explains when it is allowed."
2. In `catalogue list`, print it last, under a rule, with the title "Mermaid
   (escape hatch)".
3. Add `W_MERMAID`: every `mermaid` figure gets one review prompt. The message
   reads the first line of the fence and names the native component:
   - `flowchart` → `architecture` or `transform`;
   - `sequenceDiagram` → `trace`;
   - `stateDiagram-v2` → `state`;
   - `erDiagram`, `classDiagram` → `domain`;
   - `gantt` → `plan`, with the source of each `due` date in `evidence`.

   It is a prompt, not an error.
4. Rewrite `mermaid.md` around one question: "Is there no native component
   for this, and does the reader accept a figure without inspectable parts?"
   Keep the safety rules there. Do not copy them into `format.md`.
5. Set `theme: 'base'` with the page tokens (3.5), so a figure that stays
   looks like the page.

### 6.3 Later: opt-in extension

In a later release, move Mermaid out of the default toolkit into an extension
(§14). A document pins it with `extension pin DOC DIGEST`, and the user trusts
it once. The 17 MB leaves the default install, the `E_UNSAFE_CONTENT` rules
move with it, and the `examples/mermaid-*` bundles become the extension's own
examples. Existing documents keep compiling once they pin the extension;
`check` reports `E_EXTENSION_MISSING` with the pin command for the rest.

Removal from the default release is a breaking change and needs a REVISIONS
entry and a migration line in the release notes.

## 7. Catalogue clarity, beyond Mermaid

- Make step 4 of SKILL.md a table with three columns: question, component,
  and "not this one because". The list form today hides the contrasts.
  Mermaid is not a row (6.2).
- Add a "Confused with" line at the top of each guide, after the question.
  Example for `state`: "Confused with `trace` (one run) and `plan` (steps,
  not states)."
- `cause` and `trace` in a root-cause document: the skill states that a
  root-cause document normally has both. The mechanism comes first, and one
  observed run comes second.
- `annotated` is the only component that shows code. With 4.4, every part can
  open code, so add to the `annotated` guide: "Use `evidence` on a node when
  one excerpt explains one part. Use `annotated` when two or more spots in
  one excerpt each need words."

## 8. Penpot changes

1. Create the library colours and tokens for every `--vs-*` value, including
   the six category hues, light and dark. Bind the Foundations swatches to
   them.
2. Rewrite principle 4 as in 2.1, and add principle 8 as in 2.2. Change the
   DON'T example of principle 4 from "colour-coded roles" to "a second hue
   variable in one figure".
3. `figure-part / node`: add a `role` variant axis (interface, process,
   storage, external, decision, concept) with the fill, stroke, and shape from
   3.2.
4. `figure-part / event`: remove the `[kind]` line; add variants for wait and
   failure; add the branch bands.
5. `figure-part / plan-task`: a `status` variant axis.
6. `figure-part / cause-link`: a `basis` variant axis with the line patterns.
7. New: `figure-part / legend`, `figure-part / concept`, `figure-part /
   relation`, and `catalogue-component / domain` (light and dark).
8. Retheme the `catalogue-component / mermaid` boards to the base theme with
   the page tokens, and mark the boards "escape hatch".
9. Reader UI: `ui / inspector` with the sections from 4.2; `ui / view-bar`
   with the wide-screen "Show as list" state.
10. Fix the trace board so that branch headings do not overlap, and remove the
    per-box layer number.

## 9. Order of work

| Phase | Content | Depends on |
|---|---|---|
| 1 | Tokens (3.1), legend (3.3), role and status and basis encoding (3.2), box content (3.4), Penpot items 1 to 6 | — |
| 2 | Lists behind a toggle (4.1), inspector sections (4.2), hover neighbourhood (4.3), appendix (4.5), compare cells (4.6), edge tooltips (4.7), branch heading fix (F8), terms on hover (13) | 1 |
| 3 | `evidence` on parts (4.4), skill and guide changes (7), STE rules and prompts (11), skill prompt changes and prompts (12) | 2 |
| 4 | `domain` component (5), Penpot item 7 | 1, 3 |
| 5 | Mermaid demotion: skill text, `W_MERMAID`, theme (6.2), Penpot item 8 | 4 |
| 6 | New components and figure interactions (14): `steps`, `note`, `self-check`, `measure`, `tree`, and the `trace` and `annotated` extensions; collapsible groups and cross-figure highlight | 1, 3 |
| 7 | Dogfood run 3 on one real document with a domain, then the comprehension trial | 1 to 6 |
| 8 | Mermaid as an opt-in extension (6.3), in a later release | 5, and an extension registry that can hold a browser bundle |

Phase 1 is CSS, `svg.ts`, and the compiler's legend output. It changes no
source format, so every fixture still compiles. Phases 3 to 5 change the
format and need a `format.md` revision and new fixtures.

## 10. Decisions on the open questions

Taken with the user on 27 September 2026.

| Question | Decision |
|---|---|
| Which fact gets the hue in `transform`? | The lossy conversion. Location stays as text (3.2). |
| May a concept exist without a definition? | No. Every concept names a `definition` (5.3). |
| `evidence` attribute, or `cite` in the body? | Both, with one rule for each (4.4). |
| Dates on a plan? | Yes: `due` on `task`, cited, drawn as text (4.4). |
| When must a document open with a domain? | Never by rule. The skill suggests it, the agent decides, a user request overrides (5.6). |
| Hover on touch screens? | Hover is an enhancement. The inspector carries the same data, and the guides say so (4.3, 4.7). |
| Size budget? | Measure after phase 2 against `docs/validation/budgets.md`. Not a decision yet. |

## 11. Prose in explanations follows ASD-STE 100

### 11.1 Finding

The skill has two prose rules today. One is the "Prefer / Avoid" pair at the
end of SKILL.md. The other is step 11 ("remove stock phrases, generic praise,
repetition"). Neither is testable. The Penpot principle 7 ("One word, one meaning") applies
to the toolkit's own names, not to the explanations it produces.

The documents Visser produces are for humans who must build a mental model
fast, and for an LLM that reads the Markdown projection later. Simplified
Technical English (ASD-STE 100) was written for the first reader and helps the
second, because it removes ambiguity.

### 11.2 Rules for the skill

Add a section "Write in Simplified Technical English" to SKILL.md, and a
`references/prose.md` guide with valid and invalid pairs, as `format.md` has.
The rules that matter most for an explanation:

- One idea per sentence. An instruction has at most 20 words; a description
  has at most 25.
- Active voice, and the agent of the action named. "The worker retries the
  charge." Not "The charge is retried."
- Simple tenses only. No "-ing" main verbs, no present perfect.
- One word for one meaning, and one meaning for one word. The `domain` map
  and `definition` blocks are where the words are fixed.
- Define a term where the reader first needs it, with `term` and
  `definition`. After that, the same word every time.
- No noun strings longer than two nouns. "The lock file of the document",
  not "the document lock file digest".
- Exact numbers. Not "several", "some", "many".
- No contractions, idioms, or metaphors.
- "If" for a condition, "when" for a point in time.
- Articles kept. Terse means fewer ideas per sentence, not dropped words.

The rules apply to prose, figure `title`, `question`, edge and event labels,
and definitions. They do not apply to captured code, quoted material, or
identifiers.

### 11.3 Review prompts

Extend `check --review` with prompts that a machine can test. Each is a
warning, not an error:

| Prompt | Test |
|---|---|
| `W_SENTENCE_LENGTH` | A sentence in prose or a part body over 25 words. |
| `W_PASSIVE` | "is", "are", "was", "were", "be", "been" followed by a past participle, in prose. A list of allowed cases (for example "is stored") can shrink the noise. |
| `W_CONTRACTION` | An apostrophe contraction such as "don't" or "it's". |
| `W_VAGUE_QUANTITY` | "some", "several", "many", "a few", "various" in prose. |
| `W_JARGON` (existing) | Extend it to count a term that appears 2 or more times with no `definition`. |
| `W_SYNONYM` | Two different labels for one `entity` across figures. The data already exists: an `actor` with `entity` and a different `label`. |

`W_PASSIVE` and `W_JARGON` will have false positives. The skill text says
that the prompts are questions, not verdicts, and that rule stays.

### 11.4 This document

This document follows the same rules. A scan on 27 September 2026 found 17
sentences over 25 words and 5 vague or modal words; this revision removed
them. The `docs/validation/dogfood-*.md` logs and the two authored
explanations were not scanned. Scan them when `W_SENTENCE_LENGTH` exists.

## 12. The skill prompt

### 12.1 Finding: the skill writes prose-first documents

The goal is a document where a picture carries the mechanism and the prose
is short. The hand-written example `order-intake` meets it. The two documents
that the skill wrote do not.

| Measure | `order-intake` (hand-written) | `how-visser-works` (skill) | `life-of-a-target-id` (skill) |
|---|---|---|---|
| Prose words, tags and sources removed | 268 | 2,005 | 1,469 |
| Words before the first figure | 53 | 352 | 363 |
| Figures | 3 | 2 | 3 |
| `detail` blocks | 0 | 2 | 0 |
| `reader` profile in frontmatter | yes | no | no |
| Edge labels over 5 words | 0 | 4 | 5 |
| Node labels over 4 words | 1 | 11 | 0 |

Both skill documents passed `check`, `check --review`, and the markdown
export test with 0 prompts. The checks measure structure and evidence. They
do not measure length, label length, or where the first figure sits.

Four causes in the skill text:

1. Step 4 says "Start with `prose`". The rule exists to stop decorative
   diagrams, and it works. It also makes the main path prose, with the figure
   as an illustration after 350 words.
2. Step 3 says "sketch the mental model privately". Nothing makes the sketch
   visible, so no one can redirect the document before it is written.
3. Nothing states a budget. The skill says "optimize understanding, not word
   count", and an agent reads that as "length is free".
4. The `reader` profile (`knows`, `new`, `mustUnderstand`) is optional and
   unused. `how-visser-works` has none, so `W_JARGON` had nothing to compare
   against, and the review questions had no reader to test.

A fifth cause is attention. SKILL.md is about 1,700 words, and about half is
operations: the shim, locks, trust, the toolkit repository exception, and the
packet workflow. The craft rules share the page with them.

### 12.2 Ideas, pressure-tested

| Idea | Risk | Mitigation | Verdict |
|---|---|---|---|
| A. Figure-first sections: a section that has a figure opens with it, and the prose after it refers to parts by name. | Diagrams for everything, the thing "start with prose" prevents. | Keep "each visual needs a `question`; if prose answers it as well, remove it", and add the figure budget (idea C). Both together push toward few, strong figures. | Adopt. |
| B. A visible outline before writing: one table with section, question, representation, and word budget, given in the reply, not as a question to the user. | An extra step, and a temptation to re-ask settled questions. | The outline is a statement, not a question. The skill already says to ask only when a choice changes the document. | Adopt. |
| C. Budgets by `kind`: main-path words, figures, and words before the first figure. Bodies, details, and the appendix do not count. | A budget cuts a caveat that changes the conclusion. | The rule "a caveat that changes the conclusion stays in the main sentence" already exists and wins. Depth goes to `detail` and part bodies, which are free. | Adopt, as review prompts, not errors. |
| D. Label limits: node label 4 words, edge label 5 words; the rest goes in the part body. | A label that must carry a flag, as dogfood-2 Q4 showed (`refs refresh --acknowledge-stale`). | A prompt, not an error. The inspector and the list show the body. | Adopt. |
| E. `reader.mustUnderstand` required, and rendered as the lede line: "After this page you can: …". | §9.11 forbids a mandatory executive-summary tile. | It is one line from frontmatter data, not a tile, and the reader can skip it. Make the rendering optional; make the frontmatter required for `teaching`, `architecture`, and `root-cause`. | Adopt, rendering optional. |
| F. A self-check against `mustUnderstand`: for each item, name the target on the main path that answers it. | The author knows the answers, so the check is weak. | It still catches an answer that lives only in a detail, which is the failure the comprehension trial looks for (Q1). | Adopt as a step. |
| G. A cold read by a fresh agent with only the markdown export, who answers the `mustUnderstand` items. | Needs an agent runtime; the skill is plain instruction text. Costs tokens. | Conditional: "when a subagent is available". The dogfood logs show that a second reader found claims the author missed (dogfood-1 P10). | Adopt, conditional. |
| H. Split SKILL.md: craft first, operations in `references/operations.md`. | The safety rules (shim, trust, never install) are the ones an agent must not miss. | Keep the boundaries block and the five safety sentences in SKILL.md. Move only the toolkit-repository exception, the lock convention, and the packet workflow detail. | Adopt, with the safety block kept. |
| I. Section headings state the answer, not the topic. | Hard to test by machine. | Guide rule with examples: "Where an ID comes from" (good), "The parts and who calls whom" (a topic). A heading under 3 words gets a prompt. | Adopt as a guide rule. |
| J. No prose restates a part body. | Similarity detection is fuzzy. | An 8-word shingle overlap between a part body and a paragraph is cheap and catches copies. | Adopt as a prompt. |
| K. Concrete thresholds for the visual inspection step. | The agent has no browser in many sessions. | The thresholds apply when it has one; without one the agent says so, as today. | Adopt. |
| L. A minimum number of figures, or a figure per section. | This is the decorative-diagram failure by rule. | None. | Reject. |
| M. Ask the user for the reader profile at the start. | Re-asks a settled question and blocks the run. | Fill it from the request and say so; ask only when the request gives no reader. | Reject the question, adopt the fill. |

### 12.3 Changes to SKILL.md

1. **Step 1 writes the reader.** "Write `reader.profile`, `knows`, `new`, and
   `mustUnderstand` in the frontmatter. `mustUnderstand` lists 2 to 5 things
   the reader can do after the page, each testable." `init` gets
   `--must-understand` and prints a reminder when it is missing.
2. **Step 3 becomes visible.** "Give the outline in your reply before you
   write: one row per section with its question, its representation, and its
   word budget. Do not ask the user to approve it. Continue."
3. **Step 4 is rewritten.** Replace "Start with `prose`" with: "A section
   answers one question. If a component answers it, the section opens with
   that figure and the prose after it explains the path through the figure,
   naming parts. If no component answers it better than prose, write prose.
   A visual with no question, or a question that prose answers as well, is
   removed." Keep the list of components with their questions. Add the
   `domain` line and remove the `mermaid` line (section 6).
4. **Step 7 gains three rules.** "A node label has at most 4 words, and an
   edge label has at most 5. The rest goes in the part body. A part body
   carries the why of that part, and the prose does not repeat it. A
   `definition` renders in the appendix. Introduce the term with `term` at
   first use, or open with a `domain`."
5. **New step, before 8: budgets.** By `kind`, main-path prose only:
   `teaching` 1,200 words and 5 figures; `architecture` 900 and 4;
   `root-cause` 800 and 3; `plan` 600 and 2; `decision` 700 and 2;
   `reference` no limit. Words before the first figure: 120. "Over budget
   means move depth into `detail` and part bodies, or split the document. It
   never means drop a caveat."
6. **Step 9 gains the self-check.** "For each `mustUnderstand` item, name the
   target on the main path that answers it. If the answer is only in a
   `detail` or a part body, move it. When a subagent is available, give it
   the markdown export only and the `mustUnderstand` items as questions; a
   wrong or missing answer is a finding."
7. **Step 10 gets thresholds.** "Inspect each figure at 1440 px. Each of
   these is a finding: a label that wraps to 3 lines, two labels that
   overlap, a figure taller than 700 px, a node with more than 6 edges. Split
   the figure by question, or shorten the labels. Do not shrink the text."
8. **Step 11 gains anti-patterns.** Add these to the list:
   - a heading that names a topic instead of an answer;
   - an interpretation paragraph that repeats the `question`;
   - a `compare` with a winner;
   - a trace of a straight line;
   - a section that exists for symmetry.
9. **Write in STE** (section 11) as its own short block after the boundaries.
10. **Move operations out.** The toolkit-repository exception, the lock
    convention, the `--dev-toolkit` rule, and the packet workflow detail go
    to `references/operations.md` and `references/handoff.md`. SKILL.md keeps
    the boundaries block and the five safety sentences: shim only, never
    install, never trust, never publish, stop on `E_TOOLKIT_*`. One line
    names the reference.

### 12.4 Review prompts that test the changes

| Prompt | Test |
|---|---|
| `W_READER` | `reader.mustUnderstand` missing or empty in a `teaching`, `architecture`, or `root-cause` document. |
| `W_LENGTH` | Main-path words over the budget for the `kind`. |
| `W_FIGURE_COUNT` | Figures over the budget for the `kind`. |
| `W_LATE_FIGURE` | More than 120 main-path words before the first figure, in a document that has one. |
| `W_LABEL_LENGTH` | A node label over 4 words or an edge label over 5. |
| `W_DUPLICATE` | An 8-word run that appears in a part body and in a paragraph. |
| `W_HEADING` | An h2 under 3 words. |

All are prompts. `check --review` prints them with the budget and the
measured value, so the agent sees the distance, not only the fact.

### 12.5 How to know it worked

Rerun the two skill-written documents through the revised skill, as dogfood
run 3. The targets, measured with the script that produced the table in 12.1:

- main-path words under the budget for `teaching` (1,200);
- words before the first figure under 120;
- 0 labels over the limit;
- `reader.mustUnderstand` present, and each item answered from the main path;
- `check --review` at 0 prompts after the fixes, with the new prompts on.

Then run the comprehension trial on the rewritten pages. The trial is the
only test of understanding; the numbers above test the shape.

## 13. Terms and definitions on hover

### 13.1 What exists

The mechanism is built and works. A `definition` block owns a term. A
`{% term ref="def_x" %}word{% /term %}` tag in prose renders as a link with a
dotted underline. On hover or keyboard focus, `reader.ts` shows the first
sentence of the definition in a dark bubble under the word. A click opens the
full definition in the inspector. The bubble is hoverable and dismissible, as
§10.4 requires. `term-hover.png` shows it.

### 13.2 Finding: the reader gets it once

The author tags a term where it is introduced, and nowhere else. In the two
skill-written documents:

| Document | Term | Tagged uses | Untagged uses |
|---|---|---|---|
| `how-visser-works` | target | 0 | 20 |
| `how-visser-works` | source bundle | 0 | 2 |
| `how-visser-works` | toolkit release | 0 | 1 |
| `how-visser-works` | reference packet | 1 | 2 |
| `life-of-a-target-id` | target | 1 | 27 |
| `life-of-a-target-id` | reference packet | 1 | 2 |

`life-of-a-target-id` has 1,469 words and 2 hoverable terms. A reader who
meets "target" in section 4 has no help there. The help exists 900 words
earlier.

Three smaller faults:

- The term link uses the accent colour, so it looks like a hyperlink or a
  citation. A term is not an action; it is a word with a meaning.
- The bubble sits under the word and covers the next line of text.
- Terms inside figure labels, table cells, and part bodies are never tagged,
  and the `term` tag is not allowed in a label attribute.

### 13.3 Change: the compiler links every use

Mark every occurrence at build time, not only where the author wrote a tag.

1. **Auto-link.** For each `definition`, the compiler finds every whole-word
   occurrence of its `term` in prose, lists, tables, part bodies, and figure
   labels. A new optional `aliases` list adds plurals and short forms. Each
   occurrence becomes a term link. The match ignores case and stops at word
   boundaries. The output is deterministic, so §7.5 holds.
2. **Where it does not link.** Code spans and fences. Headings. The term's
   own definition. A `source`. An existing `term` or `cite`. A definition
   with `auto=false` is never auto-linked, and the author tags it by hand.
3. **The author's tag stays.** `{% term %}` still works. It is the only way
   to link a phrasing that is not the term or an alias, such as "the
   packet's owner". The guide says: "Write the definition; the build links
   the word. Tag by hand only for a different phrasing."
4. **Text projection unchanged.** The Markdown projection prints plain words.
   The definitions list at the end is the glossary for an LLM reader. Auto
   links add no bytes to `document.md`.

Expected result on `life-of-a-target-id`: 31 hoverable terms instead of 2,
with no change to the source.

### 13.4 Change: the look

- **Underline.** A term gets a 1 px dotted underline in `--vs-muted`, offset
  0.2 em, and body ink for the text. No accent colour. On hover the underline
  becomes solid. The dotted underline is the paired cue; colour alone never
  marks a term.
- **Bubble.** Place it above the word when there is room, else below, with a
  4 px arrow that points at the word. Width up to 40 ch. It holds the first
  sentence and a small "Open definition" link. It must not cover the line the
  reader is on.
- **Figures.** A term inside an SVG label gets the same dotted underline
  (`text-decoration` works in SVG) and the same bubble on hover. The label is
  already a link to the part, so the term inside it gets its own hit area.
  On a narrow screen the inspector shows the definition under the part.
- **Touch.** A tap on a term shows the bubble; a second tap opens the
  inspector. The 44 px hit area from `reader.css` stays.
- **Dark mode and forced colours.** The bubble uses `--vs-fg` on `--vs-bg`
  with a 1 px `--vs-rule` border. Today it uses inverted colours. With the
  page colours it reads as part of the page in both schemes.

Add a Penpot component `ui / term` state set: rest, hover, focus, with the
bubble above and below.

### 13.5 Change: density control

Twenty-seven underlines for one word is noise if each is strong. The
underline in 13.4 is light for that reason. Two more controls:

- One underline per paragraph for the same term. Later occurrences in the
  same paragraph are hoverable but not underlined. The first occurrence in
  each paragraph is enough of a signal.
- A `domain` figure (section 5) at the top gives the reader all terms at
  once, so the underlines are reminders, not the introduction.

### 13.6 Review prompts

- `W_JARGON` (existing): keep it for terms with no definition. With
  auto-link, "defined but not tagged" is no longer a case.
- `W_TERM_UNUSED`: a definition whose term appears nowhere in the main path.
  The definition is dead weight, or the prose uses a synonym (section 11,
  one word one meaning).
- `W_TERM_COLLISION`: two definitions whose term or aliases overlap, or a
  term that is also a common word in the document. "Target" is fine.
  "State" in a state document is not. The author adds `auto=false` and tags
  by hand, or renames the term.

### 13.7 Skill text

In step 7, replace the sentence "Introduce an unfamiliar term inline where
the reader first needs it (`term` and `definition`)". The new text: "Define
each unfamiliar term once in a `definition`. The build links every use. Give
the definition's first sentence the whole meaning, because that sentence is
the hover text. Add `aliases` for plurals and short forms."

## 14. New components and figure interactions

Decisions taken with the user on 27 September 2026. Each item states the
question it answers, its shape, and the misuse it must refuse. §14.4 sets the
bar for a catalogue entry: a reusable question, text-visible semantics,
static and narrow views, and a misleading counterexample. Each item below
meets it or says why it is not a component.

### 14.1 `steps`: a walkthrough inside a figure

**Question:** which sequence of observations helps the reader understand this
figure?

A `steps` child of any figure, with `step` children. Each step names the
targets it is about and holds text with citations.

```markdown
{% graph id="components" mode="architecture" title="..." question="..." %}
...nodes and edges...

{% steps id="walk_order" %}
{% step id="wk_1" targets=["n_api", "e_insert"] label="The API stores the order" %}
One transaction, so an order never exists without its charge request. {% cite ref="src_insert" /%}
{% /step %}
{% step id="wk_2" targets=["n_worker", "e_charge"] label="Charging is retry-safe" %}
The durable request separates acceptance from a retryable charge attempt.
{% /step %}
{% /steps %}
{% /graph %}
```

Rendering: a step bar under the figure ("1 of 4 · The API stores the order",
Previous, Next). The active step's targets get `vs-near`; the rest get
`vs-dim` (4.3). The step text and its excerpts show beside the bar. Keyboard:
arrow keys. Without JavaScript and on narrow screens: a numbered list under
the figure, each item with its targets as links. Text projection: the same
list.

Rules: `targets` name parts of the same figure. A step order is not a claim
about execution order; a `trace` makes that claim. The guide says so, and a
`steps` inside an `architecture` gets the sentence "Reading order, not
execution order" in its bar.

A walkthrough has at least two steps. Every step names at least one target,
names each target once, and has non-citation explanatory text. It earns its
control by grouping related parts into conceptual phases and adding an
invariant, boundary, contrast, or consequence. If replacing every step with
its target labels loses no meaning, remove it. `check --review` gives one
`W_WALKTHROUGH_VALUE` for the walkthrough when its figure has four or fewer
drawn parts, or when every step names exactly one different part.

Pressure test: the risk is a second trace in disguise. The mitigation is the
sentence above and the `after` rule that only `trace` has. A `steps` with
more than 8 steps gets `W_VISUAL_DENSITY`. The value review is deliberately
structural: it does not guess from word counts or text similarity.

### 14.2 `note`: a limit, an assumption, or a warning

**Question:** what must the reader not miss here?

`note kind="limit|assumption|warning"` with `id` and a body. Three kinds
only. Rendering: a 4 px left rule in a category hue (limit slate, assumption
amber, warning rose) and the kind word as a small eyebrow. No icon. Text
projection: "Limit: …".

Rules: a note is a block, so it has an ID and is referenceable. It goes
after the paragraph or figure it qualifies. The caveat rule stays. A caveat
that changes the conclusion is in the main sentence. A note can repeat it,
and a note never replaces it.

Pressure test: the risk is the admonition habit, where every section grows a
note. Two limits: no `tip`, `info`, or `success` kind, and `W_NOTE_DENSITY`
at more than one note per 300 words.

### 14.3 `self-check`: a question with a hidden answer

**Question:** can the reader predict or explain this without the page?

```markdown
{% self-check id="ck_full" question="A producer calls put() on a full queue. What happens, and what ends it?" %}
The producer waits. A consumer's take() frees one slot and wakes it. {% cite ref="src_put" /%}
{% /self-check %}
```

Rendering: the question, a "Show answer" summary, and the answer with its
citation. Text projection: question, then answer. Without JavaScript: a
native `details`.

Rules: the answer cites evidence like any claim. A self-check goes at the end of
the section that gives the answer. `kind: teaching` documents only, or a
prompt.

Pressure test: the risk is a quiz that tests recall of names. The guide
allows only the four task types of the comprehension trial: reconstruct,
predict, explain with evidence, name a limit. It gives one example of each.

### 14.4 `measure`: cited numbers as a chart

**Question:** how large is it, and how did it change?

```markdown
{% measure id="m_p99" title="p99 latency before and after single-flight" question="How much did the change reduce the tail?" unit="ms" %}
{% reading id="v_before" label="Before" value=800 valueStatus="measured" evidence=["src_dash_before"] /%}
{% reading id="v_after" label="After" value=120 valueStatus="measured" evidence=["src_dash_after"] /%}
{% /measure %}
```

Rendering: a horizontal bar per value, labelled with the number and unit,
sorted as authored. Up to 12 values. Bars are ink; a value with `valueStatus`
other than `measured` is hatched and says so. No axis ticks beyond zero and
the maximum. Text projection: a table. Narrow: the same table.

Rules: every value has `evidence`, and a value without it is
`W_EVIDENCE_GAP`. `unit` is required. No two-series charts, no lines, no
pies. A series over time is a table.

Pressure test: the risk is the metric card from §9.11. The difference is
evidence per value and one unit per figure. The guide's misleading example is
a bar chart of "estimated" values drawn like measured ones.

### 14.5 `tree`: a code map

**Question:** where is what, and who owns it?

```markdown
{% tree id="code_map" title="What each folder owns" question="Where does layout live, and what calls it?" %}
{% entry id="t_core" path="packages/core" role="process" label="Parse, validate, render" %}
{% entry id="t_layout" path="packages/core/src/compiler/layout.ts" label="ELK layout in a worker" evidence=["src_layout"] /%}
{% /entry %}
{% entry id="t_runtime" path="packages/runtime" role="interface" label="What the browser runs" /%}
{% /tree %}
```

Rendering: an indented tree with the path in mono, the label, and the role
cue from 3.2. An entry with children collapses; the top two levels are open.
An entry with `evidence` opens the excerpt in the inspector. Text
projection: an indented list. Narrow: the same.

Rules: `path` is text; nothing checks that it exists, and the guide says
so. Use `evidence` for the claim that a path holds what the label says.

Pressure test: the risk is a full directory dump. `W_VISUAL_DENSITY` at more
than 40 entries, and the guide says "entries the reader needs, not every
folder".

### 14.6 `trace` extension: observations on a time scale

**Question:** what was seen, and when?

`trace scale="time"` gains: `actor` optional (a trace with no actors has one
implicit lane), and `event kind="observation"` with `evidence`. An
observation is a log line, an alert, or a metric reading, with a `time`.
Rendering: on the order-layer axis, with time in each event label and the
evidence marker. A dependent event cannot have a time before its `after`
prerequisite. Equal times are valid; `after` orders events, not the ends of
their durations. The `cause`
figure names observations by ID in `evidence`, and `factor` gains the same
optional `evidence` attribute (a source or an observation event). The link
between a factor and the log line that supports it then exists in the data.

Pressure test: the risk is the timeline that pretends to be causal. The
`cause` guide already says timing does not establish direction; the trace
guide repeats it for observations.

### 14.7 `annotated` extension: before and after

**Question:** what changed in this code?

`annotated source="src_after" before="src_before"`. Both are captured
sources. The renderer computes a line diff and shows the two side by side on
wide screens, stacked on narrow ones, with removed lines marked. An
`annotation` gets `side="before|after"` (default after) and `lines` in that
source's numbering. Text projection: the two excerpts and the annotations,
each with its side.

Pressure test: the risk is a large diff that no reader follows. A diff over
80 lines on either side gets `W_VISUAL_DENSITY`, and the guide says to
capture the smallest ranges that show the change. A hard cap protects the
build: a side over 2,000 lines is `E_LIMIT`, and the diff strips the common
prefix and suffix before it compares, so memory stays bounded.

Capture inputs for example sources live outside every bundle root, in
`examples/_sources/NAME/`, so a bundle holds only declared files and no
folder name is reserved in the bundle format.

### 14.8 Decision record: a guide, not a component

A `kind: decision` document gets a catalogue guide `decision.md` with a
fixed shape:

1. the decision as the title, written as a claim;
2. the context in one paragraph;
3. a `compare` of the options;
4. two paragraphs headed "Chosen because" and "Revisit when";
5. a `note kind="assumption"` for each assumption.

No new tag. `compare` keeps its rule of no winner; the winner is in prose,
with reasons.

### 14.9 Figure interactions, not components

- **Collapsible groups.** An architecture `group` with `collapsed=true`
  renders as one node with a count badge ("Order service · 4"). A click
  unfolds it in place. Edges into the group attach to the collapsed node.
  Without JavaScript and in print: unfolded. This is the main tool for a
  map over 25 nodes. The compiler keeps one layout: a folded group keeps
  its dashed boundary with the collapsed node at its centre, so the map
  does not change size. A compact second layout for folded groups is later
  work, not part of this proposal. A fold box takes the `vs-near` or
  `vs-dim` state of the parts it hides, and a link to a hidden part unfolds
  its group first.
- **Cross-figure highlight.** A hover on a node marks the parts in other
  figures that share its `entity`: actors, concepts, and nodes. They get
  `vs-near`. The data exists, and only the runtime changes.
- **Edge quantities.** `edge`, `conversion`, and `dependency` gain an optional
  `quantity` (text such as "1,200 req/s") with `evidence`. It renders in the
  edge label, muted, after the label. A quantity without evidence is
  `W_EVIDENCE_GAP`.
- **Filter chips.** A figure with a hue variable (3.2) gets a chip per value
  in its legend. A click on a chip dims every part that does not have that
  value. The legend is already there; the chips add one behaviour.

### 14.10 Names, after the conflict check

A search of the Markdoc profile, the validator, the JSON schemas, Markdoc's
own built-ins, the extension namespace, the CLI commands, and the runtime
classes found no hard collision. Three decisions follow from the soft ones:

- The tag is `self-check`, not `check`, because `visser check` is a command
  and both appear in the same guide text.
- The child of `measure` is `reading`, not `value`, because `value` is also
  its attribute name.
- `evidence` on a part has the same `ids` type as the existing
  `causal-link` attribute. `concept` keeps its name; the `domain` guide says
  that a `node role="concept"` is a concept placed in an architecture map,
  and that `entity` links the two.

### 14.11 Rejected

- A `walkthrough` that spans two figures. Two `steps`, one in each, and a
  sentence between them.
- A general admonition with a free kind.
- A `timeline` component. `trace` covers it.
- A `diff` component. `annotated` covers it.
- A `decision` component with a winner. Prose carries the reasons.
- Charts with two series, lines, or pies. A table carries them.
- Zoom and pan on figures. Split the figure by question instead; a figure
  that needs zoom is two figures.
