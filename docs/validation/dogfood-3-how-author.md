# Dogfood run 3 author log: "How Visser works"

Date: 28 September 2026. Author: Codex agent. Toolkit: `dist/release`, digest
`df654b94d636…`.
This run used the current uncommitted working tree as evidence, as authorized.

## Result

- Source: `docs/explanations/how-visser-works/index.md`.
- Document ID: `c2ab082b-4ca3-49c3-a119-c2d8d4bb552e`.
- Targets: 59. The page has 3 figures: 1 domain map, 1 architecture map, and
  1 dependency plan.
- Main path: 406 words. The first figure is `d_terms`, after 33 words.
  The teaching limits are 1,200 and 120. The review reports no `W_LENGTH`
  or `W_LATE_FIGURE` prompts.
- `reader.mustUnderstand` contains 3 testable items. The domain map and build
  plan answer item 1. The guarded-edit steps and their paragraphs answer item 2.
  The architecture map and its paragraphs answer item 3.
- Every figure label passes the 4-word node and 5-word edge limits.
- The author retained 58 removed target IDs in `retiredTargets`. This direct
  document edit did not use `refs retire`, because the rewrite removed the
  old blocks in one controlled edit.

## Evidence refresh

The author first ran:

```sh
/usr/bin/node /home/r/.visser/bin/visser.cjs skill show --doc docs/explanations/how-visser-works --dev-toolkit dist/release
```

The command printed the active skill from `dist/release`. The author read its
`format.md`, `operations.md`, `prose.md`, and the `domain`, `architecture`,
`plan`, `trace`, and `tree` catalogue guides. The author also read
`docs/IMPROVEMENTS.md` section 12.5 and `docs/validation/dogfood-1.md`.

Nine current working-tree excerpts now support behaviour claims:
`src_load`, `src_shim`, `src_trust_gate`, `src_workers`, `src_stale`,
`src_recheck`, `src_replace`, `src_revision`, and `src_build`. The captures used
`capture git --working-tree`; each reported its new excerpt SHA-256. The
source revisions printed during recapture changed after document changes,
which also confirms that the evidence belongs to the current rewrite.

## Checks and artifacts

```sh
/usr/bin/node /home/r/.visser/bin/visser.cjs ids assign docs/explanations/how-visser-works/index.md --dev-toolkit dist/release
# no missing IDs

/usr/bin/node /home/r/.visser/bin/visser.cjs check docs/explanations/how-visser-works/index.md --review --dev-toolkit dist/release
# ok: 65 targets
# review: 0 prompts

/usr/bin/node /home/r/.visser/bin/visser.cjs build docs/explanations/how-visser-works/index.md --out /tmp/visser-dogfood3-how --dev-toolkit dist/release
# source revision: 2a1bce38393d56d828604103adfc6452781fb008df85d0a6a0171e3ce0b6da2b
# build ID: 742f49303bc01742b70d792ffbe850ad6c7cb665a7e5749051afcfac557f6d63

/usr/bin/node /home/r/.visser/bin/visser.cjs export docs/explanations/how-visser-works/index.md --format markdown --out /tmp/visser-dogfood3-how/document.md --dev-toolkit dist/release
```

The build wrote its snapshot under
`/tmp/visser-dogfood3-how/d/c2ab082b-4ca3-49c3-a119-c2d8d4bb552e/2a1bce38393d56d828604103adfc6452781fb008df85d0a6a0171e3ce0b6da2b/742f49303bc01742b70d792ffbe850ad6c7cb665a7e5749051afcfac557f6d63/`.
The Markdown export preserves each figure relation and dependency label.

The author also tested a render-option-only change. Default and
`--allow-layout-fallback` builds had the same source revision
`2a1bce38393d56d828604103adfc6452781fb008df85d0a6a0171e3ce0b6da2b`.
Their build IDs differed (`742f4930…` and `37c4554f…`). A packet for
`p_build_identity` then resolved `exact`. This probe supports the page claim
that a render-option-only build changes the build ID but not packet status.

## Friction and open issues

- The default `node` was Node 25.9.0. The task used `/usr/bin/node` 24.21.0,
  because the project supports Node 24.
- In the sandbox, `capture git` failed because the CLI could not spawn `git`.
  The same bounded commands succeeded with approved escalation.
- A first resolver capture used lines `148:189`, but the file has 187 lines.
  The tool returned `E_USAGE`; the corrected `148:187` capture succeeded.
  A guarded-write capture also exceeded its file length; `157:210` succeeded.
- Browser policy blocked local `file://` access to the generated page. No
  visual inspection occurred. The Markdown export was inspected instead.
- The build warns `W_DEV_TOOLKIT` because this document has no lock. This is
  expected for a document inside the toolkit repository.
