# Data transformation — `transform`

**Question:** How do information, representation, dimensions, or ownership change?

## Use it when

- A value changes encoding, shape, units, memory location, or owner, and the
  reader must see where each change happens.
- A step loses information, and the loss matters.
- A pipeline branches or merges.

## Do not use it when

- The boxes are components, not representations of one value. Use `architecture`.
- Only the order of steps matters. Use prose or `trace`.

## Misleading example

**Reject:** a generic flowchart "load → process → output" where the point is
that the tensor changes from channel-last to channel-first.

**Prefer:** stages with `representation`, `shape`, and `location`, and a
conversion label that names the operation. State `loss` on the conversion that
loses detail, so the main view shows it.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `transform` | `id`, `title`, `question` | — |
| `stage` | `id`, `label`, `representation` | `shape`, `units`, `location`, `ownership` |
| `conversion` | `id`, `from`, `to`, `label` | `loss`, `condition` |

- `shape` is a string or a list of dimension names: `shape=["batch", "channel"]`.

## Rules

- `stage` and `conversion` go directly inside the `transform`.
- `from` and `to` name stages in the same figure.
- A merge is two or more conversions with the same `to`. Explain in the
  stage body how the inputs combine.
- `shape` and `units` are descriptive text. Nothing executes them.

## Narrow screens and text

On a narrow screen stages become cards, and each conversion becomes a
sentence with its loss and condition. Branches stay visible.

## Template

```markdown explain-template
{% transform id="to_batch" title="Photo to batch" question="Where do encoding, shape, and memory location change, and where is detail lost?" %}
Each box is one representation of the same image.

{% stage id="sg_file" label="JPEG file" representation="compressed bytes" location="disk" /%}

{% stage id="sg_decoded" label="Decoded image" representation="pixel array" shape=["height", "width", "channel"] units="uint8" location="host memory" /%}

{% stage id="sg_resized" label="Resized image" representation="pixel array" shape=["224", "224", "channel"] location="host memory" %}
Every image now has the same size, which batching needs.
{% /stage %}

{% conversion id="cv_decode" from="sg_file" to="sg_decoded" label="decode" /%}

{% conversion id="cv_resize" from="sg_decoded" to="sg_resized" label="resize to 224 by 224" loss="fine detail; aspect ratio" %}
The only lossy step in this pipeline.
{% /conversion %}
{% /transform %}
```

## Diagnostics

- `E_REF_BROKEN`: `from` or `to` is not a stage in this figure.
- `E_SYNTAX`: a stage without `representation`. Name the representation.
