# Native flowchart prompt acceptance

## Scope and method

This record reviews the shipped Visser authoring instructions as a
source-aware reviewer. It does not report a model trial, a cold-reader trial,
or representative-human results. The deterministic checks named below parse
and compile small documents; they cannot establish that an author will choose
the right representation or preserve a source fact in a new task.

The reviewed instructions are `SKILL.md`, `references/catalogue/flowchart.md`,
and `references/math.md`, with syntax in `references/format.md`. The matching
unit test is `tests/unit/native-flowchart-prompt.test.ts`. Its fixtures are
inline so the expected source facts and assertions stay together.

## P01–P10 source-aware review

| Case | Evidence in the current instructions | Review result | Remaining acceptance evidence |
| --- | --- | --- | --- |
| P01 | The representation table selects flowchart for conditional next steps, architecture for components, and a numbered list for a short straight procedure. | The distinctions are explicit. | Cold-reader or paired author trial for the three task packets. |
| P02 | The same table assigns an observed run with actors and partial order to trace, persistent object transitions to state, work dependencies to plan, and a design rationale to the decision guide. | The alternatives are explicit and avoid a false one-path interpretation. | Source-aware author trial for concurrent and lifecycle packets. |
| P03 | The flowchart guide defines group membership, named decision outcomes, and the flowchart-only color attribute. The parser fixture includes a colored group and a cross-group retry. | Syntax, membership, and outcome labels are checked deterministically. Color-independent readability still needs a human reading task. | Cold-reader task with color removed or unavailable. |
| P04 | Core boundaries say to state material gaps and never invent facts. The flowchart guide specifically says to surface an absent threshold, branch coverage, retry condition, or completion guarantee. | The instruction now names the common incomplete-flowchart failure. | Prompt trial where the source omits those facts; review whether the author reports the gap. |
| P05 | Core loads `math.md` for inline prose, labels, displays, and equation targets. The math guide separates inline, display, and equation uses and preserves code and literal text. | The parser/compiler fixture preserves a fraction in prose, display, and a native label, while code and currency remain literal. | Reader task for an inline-only label with no display equation. |
| P06 | The math guide and format guide use stable equation IDs and `eqref`. | The compiler fixture checks an equation reference and generated stable anchor, without a typed number or TeX reference. | Author trial after moving the equation in a source document. |
| P07 | The math guide requires definitions, units, boundary handling, and testing both sides where the source defines them. | The instruction supports the required capacity condition review. It cannot supply an equality outcome when a source omits one. | Source-backed task with a documented equality outcome and changed-input answer. |
| P08 | The math guide keeps a native label short and puts a derivation and conditions in prose, a body, or an equation target. | The distinction is explicit. | Cold-reader task that asks for the operative condition and an assumption. |
| P09 | The math guide distinguishes invalid authored TeX from valid reader fallback and says print shows readable source. The delivery checks reject old flowchart capability claims. | Current behavior is described without promising typeset no-JS or print math. | Manual no-JS and print inspection against the packaged release. |
| P10 | The math guide explicitly preserves signs, grouping, index bounds, approximation markers, and units. The parser fixture compares decoded TeX source across the paired expressions. | Serialization identities are deterministic checks, not proof that readers distinguish the pairs. | Blind changed-input answers for each near-neighbor pair. |

## Deterministic fixture evidence

The focused unit test supplies these source-backed facts:

- A flowchart has a `validation` group colored `teal`, a `No` decision outcome,
  and a retry that crosses to a `correction` group and returns to validation.
- Math source preserves `-x^2`, `(-x)^2`, `i \le n-1`, `i \le n`, `q = C`,
  `q \approx C`, `250\,\mathrm{ms}`, and `0.25\,\mathrm{s}`. It also uses
  `\frac{a}{b}` in prose, a display equation, and a flowchart label.
- An equation target `eq_capacity` is referenced using `eqref`, then checked
  in generated HTML and Markdown for the stable target rather than a typed
  equation number.
- `$x$` inside code and `\$5` currency stay literal and do not request the
  math runtime.

The compiler assertion decodes HTML before checking TeX. The P10 assertion
checks parsed TeX values rather than relying on Markdoc escaping spelling.

## Findings and follow-up

The current instructions support the routing and math serialization cases. The
flowchart-specific P04 warning now requires a missing threshold, branch
coverage, retry condition, or completion guarantee to remain a stated gap.

No cold-reader protocol, paired baseline/revised prompt run, or source packet
trial was performed for this record. Before claiming FC23 or FC24 behavioral
acceptance, run P01–P04, P07–P08, and P10 with fixed toolkit, prompt hashes,
model route, task wording, source packet, generated document, diagnostics, and
observed semantic errors. Keep reviewers blind to answer keys until collection.
