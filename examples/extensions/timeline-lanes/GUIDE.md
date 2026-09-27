# timeline-lanes

`timeline-lanes` draws each part as one horizontal lane with a bar from `start`
to `end` on a shared axis. It answers one question: **which activities overlap
in time, and for how long?**

It is a build-only example extension. It has no browser code. The page always
shows the lanes as a text list as well, so the figure is never the only form.

## Syntax

```markdown
{% extension id="startup_lanes" use="timeline-lanes" title="Startup work" question="Which startup steps overlap?" unit="ms" %}
{% part id="lane_config" label="Load config" start=0 end=40 %}
Reads and validates the configuration file.
{% /part %}
{% part id="lane_pool" label="Open connection pool" start=20 end=180 %}
Starts after the configuration names the database.
{% /part %}
{% /extension %}
```

- `unit` (optional, on `extension`): the axis unit, at most 16 characters.
- `start` and `end` (required numbers, on each `part`): the lane's interval.
  `end` must not be before `start`.
- Each `part` is a target with a stable ID, like a graph node.

## When to use it

- The reader must see **overlap and duration** of a few concurrent activities.
- The intervals come from a measurement, a log, or a stated design, and the
  document says which.

## When not to use it

- For **order without duration**, use a `trace` with `scale="ordinal"`.
- For **cause and effect**, use a `graph mode="cause"`. Two bars that overlap
  do not show that one caused the other.
- For more than about 12 lanes, split the figure or use a table.

## A misleading counterexample

A figure with lanes "Cache warm-up" (0–300 ms) and "Slow first request"
(250–900 ms) invites the reader to conclude that the warm-up made the first
request slow. The lanes only show that the two intervals overlap. If the
document claims a cause, state the evidence in prose and show the mechanism
in a `graph mode="cause"` with a `basis` on each link.

## Trust

An extension is executable code. `explain extension install` never trusts it.
Review this guide, `schema.json`, and `build.cjs` with
`explain extension inspect DIGEST`, and then run
`explain extension trust DIGEST`. A trusted build entry runs in a separate
process with a time and memory limit. That process is **not a sandbox**: it
has the same operating-system privileges as the `explain` command.
