# Causal explanation — `graph mode="cause"`

**Question:** What mechanism links conditions to an outcome, and how strong is the support?

**Confused with:** `trace` (timing, not mechanism). A root-cause document normally has both: the mechanism first, then one observed run.

## Use it when

- An established investigation names a mechanism, and the reader must see
  which links are observed, inferred, or only a hypothesis.
- Two conditions together cause the outcome, and neither is enough alone.
- A feedback loop keeps the outcome going.

## Do not use it when

- You only have a timeline. Timing does not establish causal direction. Use
  `trace` or prose.
- You would have to investigate the cause yourself. This skill explains
  established material; state the gap instead.

## Misleading example

**Reject:** a causal diagram that labels every edge "observed" because the
incident timeline contains both endpoints.

**Prefer:** keep the observation, inference, and hypothesis distinction from
the investigation, and cite the evidence for each link with `evidence`. Keep
competing explanations; label them.

## Figure-specific review

- Read each arrow as a mechanism claim. Evidence for both endpoints does not
  establish the arrow or its direction. Check link basis separately from factors.
- Distinguish contributing, necessary, and sufficient conditions. Where inputs
  must occur together, preserve that conjunction rather than drawing alternatives.
- Test whether removing a factor is supported to prevent the outcome. If the
  source cannot establish that counterfactual, keep it unknown rather than causal proof.
- Preserve supported competing explanations and feedback. Do not promote a
  hypothesis through emphasis, position, or a confident title.
- Put the causal qualification on the main path. Use depth for the supported
  mechanism or evidence limitation; do not turn correlation into causation there.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `graph` | `id`, `title`, `question`, `mode` | — |
| `factor` | `id`, `label`, `basis` | `evidence`, `emphasis` |
| `causal-link` | `id`, `from`, `to`, `label`, `basis` | `evidence`, `emphasis` |

- `basis`: `observed`, `inferred`, `hypothesis`, `stipulated`.

## Rules

- Optional `emphasis` (`teal`, `violet`, or `amber`) draws attention to a part.
  All three values mean the same thing. Omit it when no cue helps. It does
  not encode evidence basis. See [visual language](../visual-language.md).
- `factor` and `causal-link` go directly inside the `graph`.
- `from` and `to` name factors in the same figure.
- `evidence` on a `factor` or a `causal-link` names `source` blocks or
  trace events with `kind="observation"`. An observed factor with
  `evidence` has its support in the data: the log line that shows it.
- A `causal-link` is a relationship, so its inspector shows the body first
  and the evidence last.
- Show an AND condition as its own factor labelled "AND: …", and explain it.
- A cycle is allowed; label it as feedback, not as a timeline.
- Never add probabilities or a "verified root cause" badge.

## Narrow screens and text

The text view lists each mechanism with its basis and evidence. Line style and
a text label show the basis; colour alone never does.

## Template

```markdown visser-template
{% graph id="mechanism" mode="cause" title="Two conditions together exhausted the pool" question="What links the expired key to the timeouts, and how well is each link supported?" %}
Labels state the basis of each link. Timing alone did not establish any arrow.

{% factor id="f_expiry" label="Hot key expired" basis="observed" /%}

{% factor id="f_traffic" label="High concurrent read rate" basis="observed" /%}

{% factor id="f_and" label="AND: expired key with concurrent misses" basis="inferred" %}
Keys expire daily and peak traffic occurs daily; the stall needs both at once.
{% /factor %}

{% factor id="f_timeouts" label="API requests time out" basis="observed" /%}

{% causal-link id="cl_expiry" from="f_expiry" to="f_and" label="provides the missing key" basis="observed" /%}

{% causal-link id="cl_traffic" from="f_traffic" to="f_and" label="provides concurrent misses" basis="observed" /%}

{% causal-link id="cl_stall" from="f_and" to="f_timeouts" label="identical queries exhaust the pool" basis="inferred" %}
Inferred from the cache design: without single-flight, every miss queries.
{% /causal-link %}
{% /graph %}
```

## Diagnostics

- `E_SYNTAX`: a missing or unknown `basis`. Use a listed value.
- `E_REF_BROKEN`: `evidence` names something that is not a `source` or an
  observation.
- `W_EVIDENCE_GAP` (`check --review`): an observed factor or link has no
  `evidence` and no `cite`. Name the observation, or change the basis.
