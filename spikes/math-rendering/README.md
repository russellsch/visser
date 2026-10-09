# W0 renderer and native-geometry probe

This is an isolated prototype, not a production math implementation.
It uses MathJax 4.1.3 with the fixed mathjax-tex font and base/AMS input packages.
KaTeX 0.16.47 comes from the existing repository installation for comparison.

## Reproduce

Use Node 24. The local host has it at `/opt/codex-desktop/resources/cua_node/bin/node`.

```sh
npm ci --prefix spikes/math-rendering --ignore-scripts
node spikes/math-rendering/probe.mjs
node spikes/math-rendering/benchmark.mjs
node spikes/math-rendering/geometry.mjs
```

Browser probes need the existing Playwright Chromium installation. This host requires sandbox escalation to launch Chromium.
The scripts write generated HTML, screenshots, and JSON under `reports/` in this directory, ignored by Git.
The benchmark blocks HTTP(S) requests and fails if any are attempted; standalone documents are loaded with `file://`.
It does not yet prove OS-level network isolation or packaged Visser release behavior.

## Results

Executed on Node 24.21.0 and the installed Chromium 153 through Playwright.
Three independent browser contexts ran each engine/corpus combination. The browser process was shared.
Times are observations on this host, not portable latency guarantees or cold-process benchmarks.

| Engine/output | Sparse: 2 formulas, raw HTML | Repeated: 100 formulas, raw HTML | Distinct: 100 formulas, raw HTML |
| --- | --- | --- | --- |
| Browser MathJax | 2,417,107 B | 2,422,989 B | 2,423,291 B |
| Browser KaTeX, all WOFF2 fonts embedded | 732,587 B | 738,469 B | 738,771 B |
| Pre-rendered MathJax SVG control | 6,105 B | 429,333 B | 648,187 B |

The optimized MathJax script is 1,811,939 B before standalone base64 encoding.
The first build unnecessarily included the default NewCM font alongside the selected font.
The benchmark aliases the default SVG font module to the selected TeX font, eliminating that unused dependency from the browser output.
The Node prototype still loads the upstream default module, but output uses the explicitly selected TeX font.

Browser rendering does not reduce file size for these corpora.
KaTeX is smaller and faster here, but its HTML output does not directly supply the SVG geometry needed by native diagrams.
The pre-rendered controls deliberately include repeated paths; a shared glyph cache could make them smaller still.
This comparison excludes the common Visser reader shell, which each alternative would share.

MathJax's fixed `em=16`, `ex=8` conversion produces stable SVG dimensions.
Native SVG placement converts the returned ex dimensions using a fixed `fontSize/2` factor and writes explicit numeric dimensions.
Five representative expressions at a 14px math scale fit their measured rectangles in Chromium.
Viewport dimension differences were below 0.000003px; the largest ink-bound rounding excess was below 0.001px in this corpus.
The probe uses a 0.02px numerical tolerance to accommodate serialization and browser floating-point conversion, not a visual overflow allowance.
Production geometry will also need padding, mixed-run baseline tests, larger corpus checks, and per-family integration.

## Findings that changed the candidate configuration

1. MathJax 4 splits inline output into multiple SVG siblings at some spaces by default.
   A first geometry probe incorrectly treated these as one image; visual inspection showed misplaced trailing `dx`.
   `linebreaks.inline=false` now enforces one indivisible SVG, and the converter asserts one output child.
   The benchmark and geometry evidence were regenerated after that fix.
2. Nested SVG `getBoundingClientRect()` can report glyph ink rather than the reserved viewport.
   The geometry probe now compares viewport dimensions and ink containment separately.
3. Unknown Unicode can produce browser-font-dependent SVG `<text>` output.
   A deterministic production adapter must reject unsupported glyph output instead of assuming all equations contain only paths.
4. The base/AMS configuration rejects unknown commands, `href`, `def`, `newcommand`, and `unicode`.
   This is useful evidence but is not a complete TeX security or resource-limit audit.

The parent visually inspected the sparse and geometry screenshots. This is not human baseline approval.
Full engine selection awaits the parser, Mermaid, resource/cancellation, and policy decisions in W0.
