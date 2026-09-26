# Spike 1: Markdoc span characterization

**Result:** the §6.3 marker and §7.3 byte-span design works on `@markdoc/markdoc` 0.5.10 (bundles markdown-it 12.3.2). Four Markdoc behaviors need adapter rules; spec revision 1.4 adds them. No blocker.

**Environment:** Linux, Node v25.9.0 (the spec targets Node 24; rerun there). Markdoc pinned exactly.

**Reproduce:** `npm ci && npm run spike` (runs `spans.mjs`, `probes.mjs`, `fence-probe.mjs`; raw output in `results.txt`).

## Appendix A spans

All 23 targets bind (5 markers, 18 tag IDs). Byte spans start at the marker or tag opening and end at the matching close with its final newline. Spans are identical in the LF, CRLF, BOM, and no-final-newline variants. Markdoc gives line maps only, not byte or column offsets, so the line-start table in §7.3 is necessary.

## Verdicts

| Spec rule | Verdict | Evidence and spec change |
|---|---|---|
| §6.3 markers are block tokens that bind to the next block | Confirmed | `comment` nodes with line maps; marker-then-marker and marker-before-tag are detectable. |
| §6.3 marker is a whole line | Spec change | Text after `-->` is silently dropped; a multi-line `ex:id` comment evades a raw-line check. Reject both with `E_SYNTAX`. |
| §6.4 no markers in lists, quotes, or tag bodies | Confirmed | These markers appear as nested comment nodes and can be rejected. |
| Headings | Spec change | Markdoc disables setext headings; `Title\n---` becomes a paragraph plus a rule. ATX only; reject setext underlines. Indented code is also disabled; fences only. |
| §6.5 raw HTML rejected by the adapter | Confirmed | Default: HTML becomes escaped text. With `html: true`: `html_block`/`html_inline` tokens for prose HTML only, none from fences or inline code; markers still work. |
| §6.5 fenced examples stay displayed code | Spec change (major) | By default Markdoc parses tags and variables in fences: a fenced `{% graph %}` renders as an empty `<pre>`, an unclosed fenced tag is a critical error, and fenced `{% $x %}` is replaced by a variable value. Raw `token.content` is kept. The adapter must discard fence children and use raw content. |
| §6.5 variables/functions rejected before transform | Confirmed | Distinct `Variable` and `Function` AST classes (safe only with the fence rule). |
| §6.5 one-line tag openings | Confirmed, adapter-enforced | Markdoc accepts multi-line openings. |
| §6.5 attribute literals | Confirmed | Arrays, nested objects, floats, negatives parse. Markdoc has no depth limit, so the §2.3 limits are Explain's. |
| `if`/`partial`, tables, inline code | Confirmed | `if`/`partial` surface as tag names; GFM tables parse by default; tag syntax in inline code is inert. |
