# Annotated artifact — `annotated`

**Question:** What should I notice in this code, trace, formula-like text, or image?

**Confused with:** `architecture` (how parts interact) and an inline `cite` (one line of evidence is enough).

## Use it when

- The reader must look at specific lines of real code, a log, or a region of
  an image, and each spot needs its own explanation.
- The exact text is the evidence, and a paraphrase would lose it.
- Two or more spots in one excerpt each need words.

## Do not use it when

- The point is how parts interact. Use `architecture` and cite the code.
- One line is enough. Cite the source inline with `{% cite ref="..." %}`.
- One excerpt explains one part. Put `evidence` on that part.
- The source is `link-only`. Annotations need captured content.

## Misleading example

**Reject:** a Git excerpt that starts at file line 120 but whose annotation
says "line 1", or a screenshot with a red circle and no text.

**Prefer:** line numbers from the original file, and a label plus body for
each annotation. Every region of an image needs a description in the source.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `annotated` | `id`, `title`, `question`, `source` | `before` |
| `annotation` | `id`, `label` | `lines`, `region`, `side` |
| `source` | `id`, `kind`, `title` | `language`, `asset`, `excerptSha256`, `repository`, `commit`, `baseCommit`, `file`, `start`, `end`, `symbol`, `url`, `capturedAt`, `originFileSha256`, `availability` |

- `lines=[start, end]` uses original-file line numbers when the source has `start`.
- `region=[x, y, width, height]` uses coordinates from 0 to 1 on the image.
- `before` names a second captured text source: the code before a change.
- `side`: `before` or `after` (the default). It selects the source whose
  line numbers `lines` uses.
- `source kind`: `git`, `working-tree`, `web`, `file`, `supplied`, `example`.
- `source availability`: `captured`, `link-only`.

## Rules

- `annotated source` names a `source` block. Create it with `visser capture`;
  never type `excerptSha256` or line numbers by hand.
- `annotation` goes directly inside the `annotated`.
- Each annotation has exactly one of `lines` or `region`.
- `lines` needs a captured text source, and must be inside its `start` to `end`.
- `region` needs a captured raster image `asset` (PNG, JPEG, or WebP).
- With `before`, the page computes a line diff and marks each removed line
  with "−" and each added line with "+". Capture the smallest ranges that
  show the change. Above 80 lines on one side you get `W_VISUAL_DENSITY`.

## Narrow screens and text

On a narrow screen the artifact comes first, then an ordered list of
annotations. With `before`, the two sources sit side by side on a screen
900 px or wider, and stack on a narrower one. The text projection prints each
annotation with its line range, and with `before` also its side and the diff.

## Template

The source block below is what `visser capture file --kind example` writes
for a seven-line file. Capture your own source; do not copy this hash.

````markdown visser-template
{% annotated id="take_code" title="Where the wait ends" question="Which line guarantees that take() returns or raises?" source="src_take" %}
The deadline test is the only exit besides an item.

{% annotation id="ann_deadline" label="Stop when the deadline passes" lines=[4, 5] %}
The check runs before each wait, so the function never waits past the deadline.
{% /annotation %}

{% annotation id="ann_wait" label="Wait only for the time that is left" lines=[6, 6] /%}
{% /annotated %}

{% source id="src_take" kind="example" title="Illustrative blocking take" language="python" start=1 end=7 excerptSha256="91c8288e250280a5d764a18cb468dca027ec1529067c5f4d96e80e0949b04b2c" %}
```python
def take(queue, timeout_s):
    deadline = now() + timeout_s
    while queue.empty():
        if now() >= deadline:
            raise TimeoutError()
        queue.wait(deadline - now())
    return queue.pop()
```
{% /source %}
````

## Diagnostics

- `E_SEMANTIC`: lines outside the source range, both `lines` and `region`, a
  link-only source, `side="before"` with no `before`, or a `before` diff with a
  source that has no text excerpt. Recapture or fix the range.
- `E_EVIDENCE_HASH`: the excerpt changed after capture. Recapture with
  `--recapture`; never edit the hash.
