# Code map — `tree`

**Question:** Where is what, and who owns it?

**Confused with:** `architecture` (who calls whom at run time, not where the code is) and a directory listing (every folder, with no reason).

## Use it when

- The reader must find the code for each part of a later figure.
- A few folders or files own distinct jobs, and the reader must see which
  job is where.
- One file holds the key mechanism, and the reader must open it.

## Do not use it when

- The point is how parts call each other. Use `architecture`.
- The list has one level and three items. Use a list in prose.
- You want to show every folder. Show the entries the reader needs, not
  every folder.

## Misleading example

**Reject:** a full directory dump of 60 entries with labels such as "utils"
and "misc". The reader cannot find the one file that matters.

**Prefer:** eight entries, each with a label that says what it owns, and
`evidence` on the entry whose code the page explains.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `tree` | `id`, `title`, `question` | — |
| `entry` | `id`, `path`, `label` | `role`, `evidence` |

- `role`: `process`, `storage`, `external`, `interface`, `decision`, `concept`.
  The same roles and cues as an `architecture` node.
- `evidence`: a list of `source` IDs, such as `["src_layout"]`.

## Rules

- `entry` goes inside the `tree` or inside another `entry`. Nest an entry to
  show that a file is inside a folder.
- `path` is text. Nothing checks that the path exists, and the page says what
  you wrote. Use `evidence` for the claim that a path holds what the label
  says.
- The label says what the entry owns, in 4 words or fewer.
- An entry with children is a toggle. The top two levels start open.
- A click on an entry opens it in the inspector. An entry with `evidence`
  shows its excerpt first.
- Above 40 entries you get `W_VISUAL_DENSITY`.

## Narrow screens and text

The tree is the same indented list on every screen. The text projection is
an indented list: the path, the label, the role, and the evidence of each
entry.

## Template

The source block below is what `visser capture file --kind example`
writes. Capture your own source; do not copy this hash.

````markdown visser-template
{% tree id="code_map" title="Layout lives in the core package" question="Where does layout live, and what calls it?" %}
Only the folders that this page talks about.

{% entry id="t_core" path="packages/core" role="process" label="Parse, validate, render" %}
{% entry id="t_layout" path="packages/core/src/compiler/layout.ts" label="Graph layout" evidence=["src_layout"] /%}
{% /entry %}
{% entry id="t_runtime" path="packages/runtime" role="interface" label="What the browser runs" /%}
{% /tree %}

{% source id="src_layout" kind="example" title="Layout entry point" language="typescript" excerptSha256="17eb3b60f6c10fc989a13a99ca998a80d3cf6788294a0d7c7099c61145b31b3b" %}
```typescript
export async function layoutGraph(input: GraphInput): Promise<GraphLayout> {
  return runInWorker(input);
}
```
{% /source %}
````

## Diagnostics

- `E_SYNTAX`: `path` or `label` is missing, the `role` is not in the list,
  or an `entry` is outside a `tree`. Fix the tag.
- `E_REF_BROKEN`: `evidence` names something that is not a `source`.
- `W_VISUAL_DENSITY`: more than 40 entries. Remove the entries the reader
  does not need.
