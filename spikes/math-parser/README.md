# Math parser W0 feasibility spike

Repository baseline: `2f6bc5c8f30363ab50392cb3bc736dfdc6808c66`. The repository pins `@markdoc/markdoc` 0.5.10. This spike has its own exact `markdown-it` 12.3.2 dependency and lock file; it changed no root dependency, lock, or production source. Run the probes with Node 24:

```sh
/opt/codex-desktop/resources/cua_node/bin/node spikes/math-parser/adapter-probe.mjs
/opt/codex-desktop/resources/cua_node/bin/node spikes/math-parser/public-token-probe.mjs
/opt/codex-desktop/resources/cua_node/bin/node spikes/math-parser/compat-probe.mjs
/opt/codex-desktop/resources/cua_node/bin/node spikes/math-parser/compat-probe.mjs --negative
```

## Result

A math-aware tokenizer can feed **public** `Markdoc.parse(tokens)` without accessing Markdoc's private tokenizer. `adapter.mjs` constructs a pinned markdown-it instance, installs small frontmatter/comment/tag rules, uses public `Markdoc.parseTags` for compatible tag metadata, and adds math block/inline rules. `math-table.cjs` is a licensed copy of markdown-it 12.3.2's table rule with a math-aware cell splitter. Its original license is in `LICENSE.markdown-it`. The adapter does no whole-source placeholder rewrite.

The executable probe passes six focused non-math AST parity cases against Markdoc's existing tokenizer: ordinary prose, list, quote, table, Markdoc tags/inline citation, and frontmatter/heading. The wider `compat-probe.mjs` matches the adapted Markdoc AST for all **19 positive** and **139 negative** Markdown fixtures. Both sides discard fence children as Visser's current adapter does. This is evidence about AST compatibility, not complete compiler behavior. The math probe also verifies:

- Inline math inside emphasis and link text, multiline list/quote text, repeated expressions, a table formula containing `|` and `&`, and an escaped `\|` inside math.
- Complete raw TeX for equation tags and standalone `$$` displays, including a matrix row separator `\\`; nested equation tags; literal code spans/fences and Markdoc-looking text inside a raw equation body.
- Original UTF-8 byte spans of inline, equation, and display occurrences with an emoji and CRLF source. Each reported span is checked against the original byte slice. The adapter maps markdown-it's normalized character offsets back to original bytes. It rejects a mismatched inline slice instead of silently returning a wrong span.
- Quoted Markdoc attribute spelling: source `label="$\\frac{a}{b}$"` decodes to one TeX backslash. An unmatched standalone `$$` or equation opener produces a parse error in the prototype. A literal `$5` leaves table cells separated.

The earlier `public-token-probe.mjs` shows why edits **after** Markdoc tokenization are insufficient: inline Markdown has already collapsed a TeX `\\` row separator, and ordinary table parsing has already split `$|x|$`. `token-shape.mjs` dumps the underlying token/AST shapes. Markdoc's own `Tokenizer` has a private markdown-it field and no public plugin-registration method (`node_modules/@markdoc/markdoc/src/tokenizer/index.ts`). `markdown-it` is bundled by Markdoc but was not a root direct dependency. The isolated spike installed exact 12.3.2 with `--ignore-scripts` and a `/tmp` npm cache.

## Production API and remaining gate

The proposed API is `tokenizeMath(sourceBytes) -> { tokens, mathOccurrences, diagnostics }`, followed by `Markdoc.parse(tokens)` and the existing Visser target/span validation. `mathOccurrences` carries raw TeX, display mode, and exact byte offsets. Use a release-pinned direct markdown-it 12.3.2 dependency and own a small tokenizer adapter based on the probe. Keep the math-aware table rule ahead of ordinary table splitting. Preserve Markdoc's MIT notice for any copied plugin behavior and markdown-it's MIT notice for the table rule. Keep raw equation bodies out of Markdoc/Markdown interpretation; let Visser's model bind their target IDs and parent IDs.

**The W0 parser integration is feasible on the installed pin.** The prototype is still narrow. It matches all existing Markdown fixture ASTs but does not prove every untested malformed tag case, table/code/currency ambiguity, or nested Markdown source-map case. `sourceStartChar` matching in table cells and line-by-line mapping of ordinary blocks need fuzz and fixture comparison before production use. The copied table rule must be maintained against the pinned markdown-it license/version. Do not lift this spike into W1 unchanged; port rules into `syntax/` with those checks, Visser diagnostics, ID ownership, and the planned parser adaptation gate. If a compact compatible adapter fails, revise the syntax decision rather than bypass the gate.

## Checks actually run

- Node 24 `adapter-probe.mjs`: passed, including six AST parity cases and representative math/source-span assertions.
- Node 24 `compat-probe.mjs`: passed, 19/19 positive fixtures matched.
- Node 24 `compat-probe.mjs --negative`: passed, 139/139 negative fixtures matched.
- Node 24 `public-token-probe.mjs`: passed; documents post-tokenization failures.
- `token-shape.mjs`: passed under the prior default Node invocation; output inspected in `/tmp/visser-math-token-shape.json`.
- Read installed Markdoc and markdown-it tokenizer sources, public declarations, package metadata, and MIT licenses. No production tests, full build, or browser checks were run.
