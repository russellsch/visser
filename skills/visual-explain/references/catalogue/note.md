# Note — `note`

**Question:** What must the reader not miss here?

**Confused with:** a caveat in the main sentence (a caveat that changes the conclusion goes there) and a `detail` (depth that the reader can skip).

## Use it when

- A limit of the claim applies to the paragraph or the figure before it, and
  the reader can miss it in the prose.
- The page depends on an assumption that the reader must check.
- An action can cause damage, and the reader must see the warning before the
  action.

## Do not use it when

- The caveat changes the conclusion. Put it in the main sentence. A note can
  repeat it; a note never replaces it.
- The text is a tip, background, or a success message. There is no such kind.
- Every section gets one. You get `W_NOTE_DENSITY` above one note for each
  300 main-path words.

## Misleading example

**Reject:** "The fix removes the stampede." followed by a warning note that
says the fix works only with one region.

**Prefer:** "The fix removes the stampede in one region." Then, if the reader
can miss it, a `note kind="limit"` that names the second region.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `note` | `id`, `kind` | — |

- `kind`: `limit`, `assumption`, `warning`. There is no other kind.

## Rules

- A note is a block at the top level. It has an ID, so a reference can name it.
- Put the note after the paragraph or the figure that it qualifies.
- Write one or two sentences. Cite a source when the note states a fact.
- The page shows a 4 px left rule and the kind word above the text: limit in
  slate, assumption in amber, warning in rose. The word is always there, so
  the colour never carries the kind alone. There is no icon.

## Narrow screens and text

The note is the same on every screen. The text projection prints
"Limit: …", "Assumption: …", or "Warning: …".

## Template

```markdown visser-template
<!-- vs:id p_claim -->
The cache fix removes the stampede in the one region that has the new client.

{% note id="nt_region" kind="limit" %}
The second region still runs the old client. The fix does not apply there.
{% /note %}
```

## Diagnostics

- `E_SYNTAX`: `kind` is missing, or it is not `limit`, `assumption`, or
  `warning`. Use one of the three.
- `E_SYNTAX`: the note is inside another tag. Move it to the top level.
- `E_SYNTAX`: the note has no body. Write the limit, the assumption, or the
  warning in it.
- `W_NOTE_DENSITY` (`check --review`): too many notes for the length of the
  main path. Keep the notes that the reader must not miss. In a
  `kind: decision` record, the assumption notes do not count.
