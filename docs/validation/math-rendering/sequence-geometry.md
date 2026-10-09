# Sequence renderer geometry evidence

Pinned source: Mermaid 12.0.0, `sequenceDiagram-PO4LG4MO.mjs`. The native baseline probe is `spikes/math-mermaid/sequence-render-probe.mjs`; it bundles the installed renderer, denies browser network requests, and records actual MathML descendant bounds in Chromium at 1440px. Results are `reports/math/sequence-native-geometry.jsonl`. This is characterization of defects, not an acceptance suite or an enabled adapter.

The 24 cases combine actor, message, self-message, spanning note, loop, branch, box and diagram title with nested fractions, a 20em right overhang, and a 10em tall rule. Fractions fit their foreignObject/viewBox in the six native math roles. Every overhang and tall-rule case in those roles escapes its foreignObject; five of six overhang cases and five of six tall-rule cases also escape the root SVG. Box and diagram titles produce no MathML for all three expressions. Actor output additionally contains literal-source fallback text inside a native `switch`; that text is not evidence of a second rendered formula.

The earlier inventory's suggestion that box titles use the actor `byKatex` path was too broad. The actual `drawBox` and box measurement paths use ordinary SVG text. The full adapter must cover box titles as well as diagram titles.

## Implementation obligations

Independent source review identified the following concrete requirements for the sequence adapter:

- Measure under the attached diagram's styling context with actor/message/note typography; the native body-level temporary div does not establish equivalent metrics. Reserve descendant ink, not only the outer layout rectangle.
- Use the measured DOM at drawing time. The native `drawKatex` and actor `byKatex` routines currently measure and create separate content; eight actor candidate calls do not await the asynchronous math drawer.
- Grow classic actor heights for tall math even when wrapping is disabled. Preserve math measurements in the one-actor note special case, message-model sizing and loop-height calculations.
- Measure box and diagram titles before final bounds. Replace the title's fixed 40px allowance with measured clearance and account for its width.
- Preserve formulas as indivisible units when wrapping mixed labels. Native `wrapLabel` can introduce breaks inside TeX; measure and draw one stored wrapped result, including generated loop brackets.
- Carry semantic actor IDs and message indices into native models. Explicit keys must identify title, boxes, loop/branch headers and every actor header/footer copy. Repeated text and measurement-call order cannot establish source identity.
- Sequence does not collapse doubled backslashes as flowchart does. Audit native line-break splitting before sharing normalization code. Account for actual created/destroyed/mirrored actor copies in resource totals.

The proposed route is a sequence-specific context scoped to one `draw` invocation, retaining the upstream no-math dispatch. Existing measured-label and ink helpers are candidate components, not proof that sequence layout is correct. Tests must cover font inheritance, actor variants and lifecycle, mirrored copies, nested sections, self-messages, spanning/single-actor notes, mixed wrapping, neighboring-shape clearance and titles. The sequence export guard stays in place until validation, source binding and geometry are integrated and tested.

## Render-copy planning evidence

A separate pinned-renderer audit found that actor creation/destruction changes vertical positions but not the header/footer copy count. Each visible supported actor has one header and, when `mirrorActors` is enabled, one footer. `hideUnusedParticipants` filtering examines all message endpoints, including activation records. Lifecycle maps use original message-array indices, not arrow ordinals.

Boxes are added on runs in filtered actor order, without deduplication. Declaring A, B, C and then placing previously declared A and C in one box yields A(box0), B(unboxed), C(box0); native layout schedules the same semantic box twice. Empty boxes schedule none. The render plan must assign separate copy keys and budget `max(0, renderedCopies - 1)` additional occurrences beyond authored validation. Loop/branch labels belong to opening/branch message indices, even though a closing message triggers drawing. Native arrow layout catches errors, so the adapter must propagate math failures or attest every expected copy after rendering. These are implementation requirements, not completed copy-budget evidence.

## Actor renderer implementation checkpoint (2026-10-06)

`scripts/mermaid-sequence-build.mjs` patches the fingerprinted artifact `05f2f26e080d2bc490589dd82fc31bff6c24c3d15b9208db2cbd56b9820e9fea`. It routes the eight actor label calls through synchronous prepared-DOM placement, replaces math actor dimensions before native layout, preserves formulas while wrapping, and uses measured text bands for glyph actors. `runtime/mermaid-sequence.ts` binds labels to actual DB actor objects, validates planned header/footer copies and releases ownership on success or failure. There is no module-global current label or text-based identity lookup.

The actor slice passes Chromium checks at 320/1440 for all eight actor types, classic/neo looks, fractions, 20em right overhang and 10em tall rules. Checks include label/viewBox containment, glyph and neighbor separation, custom font size, literal TeX preservation, complete mirrored copies, wrapping, hidden actors and create/destroy actors. Plain sequence geometry is compared with an unpatched Mermaid bundle. Failure injection verifies omitted copies reject and a failed draw releases ownership. Hidden unsupported types match the source copy planner. Evidence: `reports/math/sequence-actor-render-browser.log` (12 tests, including the preparation helper).

The shared label helper now reserves overflowing formula ink within inline flow before laying out adjacent prose. This closes an independently reproduced collision that outer label containment did not detect. Label tests cover adjacent prose/formulas, explicit breaks, typography and width validation; existing pie/timeline consumer regressions pass. This correction changes the prior unwrapped overhang path as well as the new wrapping path.

Messages, self-messages, notes, loop/branch headers, boxes and titles still need measured layout/drawing. The adapter explicitly rejects those math roles for now, and the compiler's sequence math guard remains active. Source-copy plans/maps are not yet wired to this renderer. Properties/details applicability, remaining detector families and acceptance gates remain open.

## Note and message renderer checkpoint (2026-10-06)

The note adapter now binds original type-2 messages to note models before layout. It preserves atomic math wrapping, uses the attached SVG's note typography, adjusts left/right/over widths and positions, places the measured DOM inside native padding and supplies native vertical layout with the measured height. Browser checks cover left/right, single-actor over, spanning over and reversed spanning placements, both wrap settings, fractions, 20em overhang and 10em smashed rules.

`mermaid-sequence-message.ts` and `mermaid-sequence-message-build.mjs` implement arrow-label geometry while retaining native endpoint/arrow routing. Preliminary measurements feed actor spacing; final variants use the available message width. Original message-array indices survive model creation. A measured bound hook reserves complete labels, a 16px gap above arrow geometry and self-arrow extents. Bounds are reserved again after native creation/destruction endpoint adjustments. The native catch rethrows math failures and final checks require every expected message copy.

At 320/1440, the message matrix covers eight common arrow spellings, forward/reverse/self directions, both wrap settings and fraction/overhang/tall math. Further fixtures cover activation, create/destroy, autonumber, messages/notes in plain loop containers, classic/neo looks and right-angle/curved self arrows. Assertions include complete keys, original TeX, role typography, note/foreignObject/SVG containment and neighbor/arrow separation. Failed and incomplete draws remove partial message math and release model bindings. Evidence: `reports/math/sequence-message-note-browser.log` (20 tests including existing actor/preparation regressions).

The pinned source inventory accepts all 26 native arrow-type values; the rendering matrix does not yet enumerate every newer top/bottom/reversed/central-connection spelling. Those syntax/geometry cases remain in the final sequence audit. Loop/branch-header math, box titles and diagram titles remain explicitly guarded; ordinary enclosing loops in these tests are not proof of math-header support. Activation and source-binding integration are still incomplete.

## Loop, box and title renderer checkpoint (2026-10-06)

Loop and branch measurements now reserve generated brackets, vertical advance and completed-frame bounds using original message-index ownership. Empty and actorless frames receive finite fallback bounds. Independent review reproduced an actorless-empty failure; the correction was independently rechecked with nested and overhanging cases and is closed.

Box labels use actor typography, matching native drawing. Repeated noncontiguous runs snapshot box coordinates to avoid native mutable-box reuse; copy keys reflect filtered actor order. Title placement unions the measured label with the final diagram rectangle and updates width and height. Independent box/title review found no material issue.

The final focused browser matrix covers all 26 native arrow spellings, central connections, loop/branch roles, empty/nested frames, box runs, custom box text margins and title-only diagrams at 320/1440. It checks ownership, ink/viewBox containment, geometry separation, plain native parity and failure cleanup. Evidence: `reports/math/sequence-title-loop-browser.log` (36 tests including earlier sequence regressions). Renderer role implementation is complete for this bounded matrix; worker/compiler/source/resource integration and final sequence export validation remain outstanding.

## Activation and non-label metadata audit (2026-10-06)

The isolated worker must collect source records before reconstructing the actual DB because collectors clear shared accessibility state. Plan copies with effective mirror/filter flags, retain authored records even if hidden/overwritten, reserve authored costs once plus additional rendered copies, and transport both located sequence error classes. Model/compiler transport must include original fenced-source offsets and sequence maps. Only math-bearing copies produce runtime binding rows; plain copies remain validated by the source-map builder.

The pinned native box parser references browser `window.CSS` or `Option`, so the current Node worker cannot parse box statements. Independent direct probes reproduced this on a plain teal box. Resolve this with a controlled compatibility implementation and browser parity for color/title classification before activation; do not set arbitrary globals and assume equivalent semantics.

Participant `properties` contains no ordinary rendered label: only `class` and `icon` affect rendering. Native `addProperties` sanitizes the JSON string before parsing, without the entity reversals used by links. Independent DOMPurify probing found that literal `<br>` triggers HTML parsing and entity decoding, allowing entity-escaped quotes to introduce an effective icon key and numeric entities to introduce dollars. Raw JSON parsing alone does not validate the actual data. Every decoded string token, including duplicate overwritten values and keys, must be inspected; prototype-sensitive keys and image loading must not bypass the existing profile. Arbitrary class assignment can select toolkit classes, while existing style restrictions govern declarations only. A conservative inert-properties subset would need explicit diagnostics for excluded sanitizer-sensitive input and class/icon fields; full native compatibility is not established. No properties policy change is implemented in this checkpoint.

`details` reads an external DOM element's innerHTML and can merge links as well as properties. It must remain rejected without an authorized source-backed mechanism; existing link restrictions cannot be bypassed through details. Popup link labels therefore are not an unimplemented allowed math surface under the current profile.

## Worker and compiler integration checkpoint (2026-10-06)

`sequence-node-db.ts` wraps the pinned fresh-DB getter only inside the isolated worker. `sequence-box.ts` is shared with the source collector and classifies the profile's named/system and legacy comma-RGB colors without `window`, `CSS` or `Option` globals. Twelve browser checks compare color/title splitting, wraps, malformed RGB and the existing semantic DB fixtures. The getter adaptation is separately reviewed.

Native box-title HTML sanitization is intentionally not claimed implemented. The worker rejects `<` in box titles until its normalization has source provenance. Diagram/accessibility setters have the same temporary gate: a confirmed native accessibility value containing `<br>` plus `&dollar;` entities decoded into malformed math that an identity stub missed. Independent rechecks cover overwritten titles/descriptions and multiline descriptions. Note that semicolon-bearing entity syntax in box headers is rejected by the pinned grammar before DB application; direct parseBoxData sanitizer probes alone do not establish a parseable full-diagram bypass.

Sequence records, logical slots, planned copies and hidden owners now travel through worker/model/compiler. Worker and browser share explicit `mirrorActors: true` and `hideUnusedParticipants: false`; source directives cannot override them. Authored costs are retained once and extra copy costs are added. The installed standalone smoke renders encoded YAML actor math among ordinary labels, verifies both mirrored copy keys, copies/resolves the exact original escape spelling, and checks offline/fallback/print behavior. Raw-`$$` sequence sources remain guarded. Full source-mapped HTML normalization, properties/details handling and installed all-role coverage remain required.

### Native sanitizer integration

Private pinned DOMPurify/JSDOM now supplies worker and collector parity for box/title/accessibility fields, replacing the temporary HTML gates. Text/reference/break provenance is exact when attested; complex tree repair is synthetic with authored field error locations retained. Relocatable worker packaging and installed offline export pass. See `sequence-sanitize-snapshot.json` for 40 focused, 375 Mermaid regression and 16 browser checks plus build/typecheck/standalone/budgets. Semantic comparison handling, properties/details and final all-role activation remain open.

### LaTeX serialization correction

`sequence-text.ts` reverses one serialization layer for the four HTML text entities inside already identified equations in sanitizer-owned fields. Core validation and runtime box/title measurement share it; native semantic strings remain unchanged for identity checks. Literal `<` text receives exact provenance only when real sanitizer output attests the trace. One-pass chunk assembly avoids quadratic entity processing. Independent review is closed. The title geometry matrix includes `x < y > z \& q`, both wrap settings and box margins at both widths. Evidence: `sequence-text-snapshot.json`. Properties/details and final family activation remain open.

### Participant data and toolkit class isolation

Properties now preserve native sanitizer/JSON/shallow-merge semantics; they are machine data, not math-bearing labels. Earlier suggestions to validate all decoded strings as TeX are superseded. Effective root image/prototype keys produce source-located unsafe diagnostics; details fails before external DOM access. Exact typed property identities are reconciled with the real browser DB.

Raw class data remains intact. Five fingerprinted property-derived SVG assignments namespace authored `vs-*` tokens after native string coercion and suffix assembly, before measurement/DOM insertion. Native classes stay unchanged and later reader highlighting works normally. Tests cover all four affected styles, mirrored copies, math/plain, non-string coercion, real stylesheet, clone and target/highlight behavior. Independent identity and class-boundary reviews are closed. Evidence: `sequence-properties-snapshot.json` (394 unit, 44 browser, typecheck/build/installed export). Raw guard removal and installed all-role acceptance remain next.

### Activated sequence export

The raw-dollar guard is removed for `sequenceDiagram`. Public compile validation covers every label role. Installed single-file export verifies 17 MathML expressions across all visible roles at narrow/wide widths, exact authored source references, encoded mirrored references, offline loading, source/MathML-failure fallbacks and print. Independent preactivation audit found no remaining code blocker. See `sequence-activation-snapshot.json`; final human and candidate-wide acceptance remains separate.
