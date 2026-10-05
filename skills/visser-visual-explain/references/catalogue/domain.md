# Domain model — `domain`

**Question:** Which things does this document talk about, what does each mean, and how do they relate?

**Confused with:** `architecture` (who calls whom, not what a word means), a `definition` alone (one term, no relations), and a Mermaid `erDiagram` or `classDiagram` (no parts to open).

## Use it when

- The document introduces 3 or more terms that `reader.knows` does not list.
- Two terms are easy to confuse.
- A later figure uses the terms as labels, and the reader must see them
  once, together, before the mechanism.

## Do not use it when

- One paragraph and the term links are enough.
- The point is who calls whom, or where a boundary is. Use `architecture`.
- The point is the order of events. Use `trace`.

## Misleading example

**Reject:** a map of services named "Order", "Invoice", and "Customer" with
arrows labelled "calls". That is an `architecture` map with the wrong name.

**Prefer:** concepts with definitions, and relations that say what one thing
is to the other: "Order has Invoice line (1..*)".

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `domain` | `id`, `title`, `question` | — |
| `concept` | `id`, `label`, `definition` | `category`, `attributes`, `entity`, `emphasis` |
| `relation` | `id`, `from`, `to`, `kind`, `label` | `cardinality`, `emphasis` |

- `category` (a hue and a shape on the map):
  - `thing` (slate box): it has an identity that the system keeps.
  - `actor` (teal pill): a person or a system that acts.
  - `event` (amber chamfer): it occurs at one time.
  - `value` (green double outline): a quantity with no identity, such as a price.
  - `rule` (violet dotted): a condition that must be true.
- `kind` (a line pattern):
  - `is-a` (hollow triangle): `from` is a kind of `to`.
  - `has` (diamond at `from`): `from` owns `to`. `to` needs `from`.
  - `uses` (dashed): `from` refers to `to` and does not own it.
  - `produces` (solid arrow): `from` makes `to`.
  - `identifies` (dotted): `from` names exactly one `to`.
- `attributes`: a list of short strings, such as `["id", "state"]`.
- `cardinality`: a string, such as `1..*`, shown after the label.

## Rules

- Optional `emphasis` (`teal`, `violet`, or `amber`) draws attention to a part.
  All three values mean the same thing. Omit it when no cue helps. It does
  not encode concept category or relation kind. See [visual language](../visual-language.md).
- `concept` and `relation` go directly in the `domain`.
- Each concept names its own `definition` block. One definition has one owner.
- The glossary and the hover text show the first sentence of the
  definition. Put the whole meaning in it.
- `relation` endpoints are concepts in the same figure.
- `entity` names an architecture `node` for this concept.
- Keep 2 to 25 concepts; otherwise split by question or use a definition.

## Narrow screens and text

The glossary remains in the article. On a narrow screen, a diagram preview
opens the viewer for exploration. The document-level Text view exposes each
relation. The Markdown projection gives the glossary, then each relation as
"Order has Invoice line (1..*)".

## Template

```markdown visser-template
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

## Diagnostics

- `E_REF_BROKEN`: fix the ID. The causes are:
  - `definition` does not name a `definition` block.
  - A relation endpoint is not a concept in this figure.
  - `entity` does not name a `node` without its own `entity`.
- `E_SEMANTIC`: two concepts name one definition. Give each its own.
- `E_SYNTAX`: an unknown `category` or `kind`, or a missing `definition`.
  Use a listed value.
