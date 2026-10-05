# Clearer figures authoring evaluation

These fixed packets test the authoring guidance in
[visual-language.md](../../../skills/visser-visual-explain/references/visual-language.md).
They are constructed examples, not claims about a real system. Use the same
packet, reader task, model settings, toolkit revision, and generation time
when comparing prompts. Save the original and revised Visser source, Markdown
export, and screenshots at 1440 and 320 CSS px beside each packet. Record
the exact toolkit commit and commands. No comparison run or human
comprehension trial has been completed in this record.

| Packet | Main-path question | Misleading counterexample |
| --- | --- | --- |
| [Boundary](boundary.md) | Which component owns the charge retry, and what remains outside it? | A "Misc" group invents a boundary. |
| [Causality](causality.md) | Which links are inferred, and what changes if the second input is absent? | Accent colours appear to encode evidence basis. |
| [Loss](loss.md) | When does the resize lose detail, and can it be avoided? | The condition exists only in a collapsed body. |
| [Neutral control](neutral.md) | Which component stores the receipt? | A group or accent adds no answer. |

For each output, ask an independent reviewer to reconstruct the mechanism,
explain any group boundary, and predict the named change using only the main
path. Then inspect the image and Markdown separately. Record answer excerpts,
errors, and uncertainty. A screenshot establishes legibility and visual
fidelity only. Mark representative-reader comprehension **unevaluated** until
people perform the reading tasks.

## Implemented composition and review

The [Visser source](composition/index.md), [compiled Markdown](composition.md),
and [renders](renders/) apply the revised guidance to these fixed packets.
They are one authored implementation, not a controlled old/new prompt experiment.
The neutral control deliberately remains a sentence because its question does
not need a diagram.

An independent reviewer reconstructed the answers from the main path and then
checked the Markdown separately:

- Boundary: the Charge Retry Worker owns retries; the API and worker share the
  Order Service deployment. The payment provider is external. Provider failure
  does not establish a retry schedule or eventual-success guarantee.
- Causality: both input links and the backend-read-to-connection-limit link are
  inferred; cache expiry and read rate are observations. Without the second
  input, the proposed mechanism is not established.
- Loss: 200 × 180 inputs do not lose pixels through resizing. Only an input
  with either side above 224 pixels triggers that loss; decoding and batching
  have no stated loss.
- Neutral control: Receipt Writer stores the receipt in Receipt Store.

The reviewer found the qualifications recoverable in desktop and 320 px
article flow, Markdown, and the mobile sheet. The packet and diagram question
were corrected to ask about inferred **links**, matching the three inferred
relations. Main-path task review passed; representative-reader comprehension
remains **unevaluated**.

## Reproduction record

Baseline commit: `5729a84001f6b2877b93ebc388538cbd0464ee83` plus the local
implementation identified by `../clearer-figures-source-manifest.sha256`.
Node: 25.9.0. Browser: bundled Playwright Chromium. The script renders
1440 × 1000 light, dark, and forced-colour contexts, plus a 320 × 1000 mobile
light context with touch enabled. Viewer and detail-sheet images use that
mobile context. These are development-toolkit artifacts.

- Document ID: `9f99c895-6337-4c36-af63-c682ab252af7`
- Toolkit digest: `2d6a13cb786b5d8c548ee75c12b8118de2911648780e0342967b7596eee56e6c`
- Source revision: `ba780fd354b8af8a5fb05d53da480059645fcc4155037192ef44addcaaf8c6d4`
- Build ID: `069596a981f8b2ff73be7525e00f3068bf6f880901d6cf57869e9c1f8e44c780`

From the repository root, use a fresh output directory:

```sh
npm run build
node dist/release/bin/visser.cjs build docs/validation/clearer-figures-authoring/composition/index.md --dev-toolkit dist/release --out /tmp/visser-clearer-delivery
node docs/validation/clearer-figures-authoring/render.mjs /tmp/visser-clearer-delivery
cp /tmp/visser-clearer-delivery/d/*/*/*/document.md docs/validation/clearer-figures-authoring/composition.md
```

Keep the source, toolkit, Node version, and viewport settings fixed when
reproducing these outputs. [Implementation validation](../clearer-figures-implementation.md)
records automated checks and remaining real-device acceptance work.
