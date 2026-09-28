# Dogfood run 3: "The life of a target ID"

Date: 28 September 2026. Toolkit: `dist/release`, development digest
`754fc7f2a21a…`. The author used `/usr/bin/node` 24.21.0 through the user
shim. The default `node` was 25.9.0 and was not used. This document is in the
Visser repository, so each command used `--dev-toolkit dist/release`. No lock,
toolkit installation, trust action, publication, commit, or push occurred.

## Result

- Source: `docs/explanations/life-of-a-target-id/index.md`.
- Document ID: `73df59fe-396f-4f7e-b1a2-76c1e3309c6c` (preserved).
- Targets: 99. The earlier page had 86 targets. Existing target IDs stayed in
  place. The added identity map owns 13 new targets.
- Figures: 4. The first figure is the identity map. The main path has fewer
  than 120 words before it.
- Reader outcomes: 4 testable `reader.mustUnderstand` items.
- `check --review`: exit 0, `review: 0 prompts`.
- Markdown export: `/tmp/visser-dogfood3-target/life-of-a-target-id.md`.
- Development build:
  `.visser/output/d/73df59fe-396f-4f7e-b1a2-76c1e3309c6c/23d878f5874f049f44311a533823e837453dab176b8aa49f239e60b56ad8d25b/a3cf0104bb294160dbd2626e39ac5df2eddf150b71848c253ccdad8130475cb9/index.html`.

The page keeps the distinction between a body hash and a source revision. A
CRLF-only or CR-only text change normalizes to LF before hashing. It therefore
does not change either hash. A different declared-file change changes the
source revision. The source code and the scratch exercise support these claims.

## Main-path check

| Reader outcome | Main-path target that answers it |
|---|---|
| Explain why an ID survives a move | `p_span`, `cmp_handles` |
| Predict an unrelated edit result | `lifecycle`, `p_stale` |
| Name both refresh acknowledgements | `p_refresh`, `tr_refresh_body` |
| Choose retirement for deletion | `p_retire`, `l_breaks` |

The Markdown export states each figure relationship with its label. I did not
inspect a browser view or claim visual inspection.

## Evidence refresh

I recaptured all 12 source blocks with `capture git --working-tree --recapture`.
The recaptures used the current uncommitted working tree that the user
authorized. I did not type hashes by hand. The final source revision after the
last recapture was:

`23d878f5874f049f44311a533823e837453dab176b8aa49f239e60b56ad8d25b`.

The refreshed source IDs are `src_assign`, `src_span`, `src_body_hash`,
`src_revision`, `src_locate`, `src_resolve_status`, `src_refresh`,
`src_resolve_errors`, `src_replace_guard`, `src_retention`, `src_retire`, and
`src_fork`.

## Scratch reference flow

Scratch repository: `/tmp/visser-dogfood3-target`.

Scratch document:
`/tmp/visser-dogfood3-target/docs/explanations/scratch/index.md`.

Scratch document ID: `d685b8c1-8d31-4f3a-a431-2a162328c1e5`.

| Step | Result |
|---|---|
| `refs show` and `refs resolve` for `p_keep` | `exact`; body unchanged and label matched. |
| Edit `p_change`, then resolve held `p_keep` packet | `stale`; `targetBodyUnchanged=true`. |
| Refresh with current revision and `--acknowledge-stale` | A new packet resolved `exact`. |
| Edit `p_keep`, then resolve refreshed packet | `stale`; `targetBodyUnchanged=false`. |
| Refresh without `--acknowledge-body-change` | Exit 5. The CLI printed the current target text and required the second acknowledgement. |
| Refresh with both acknowledgements | A new packet resolved `exact`. |
| `refs replace` with the kept marker | Guarded write succeeded; its old packet became `stale` with changed text. |
| `refs retire` for `p_change` with `--replacement p_keep` | Old packet resolved `deleted` and named `p_keep` as its advisory replacement. |
| Move the marked `p_keep` block | Old packet resolved `stale` with `targetBodyUnchanged=true`; the marker kept its identity. |

The retained scratch artifacts include `keep.yaml`, `keep-refreshed.yaml`,
`keep-body-refreshed.yaml`, `change.yaml`, `moved.yaml`, and `replacement.md`.

## Commands and timing

| Work | Wall time |
|---|---|
| Read the active skill, format, operations, prose, and catalogue guides | about 2 min |
| Rewrite the page and remove review prompts | about 8 min |
| Recapture 12 current-working-tree sources | about 14 sec of CLI time |
| Run the scratch reference flow | about 50 sec of CLI time |
| Final check, export, and build | about 7 sec of CLI time |

The important command forms were:

```sh
/usr/bin/node /home/r/.visser/bin/visser.cjs check DOC --review --dev-toolkit dist/release
/usr/bin/node /home/r/.visser/bin/visser.cjs capture git --working-tree --recapture ...
/usr/bin/node /home/r/.visser/bin/visser.cjs refs refresh --packet PACKET --expected-current REV --acknowledge-stale
/usr/bin/node /home/r/.visser/bin/visser.cjs refs replace --packet PACKET --replacement FILE --expected-revision REV
/usr/bin/node /home/r/.visser/bin/visser.cjs refs retire --packet PACKET --reason TEXT --replacement ID --expected-revision REV
```

## Friction and open issue

`refs show` rejected a scratch document at
`/tmp/visser-dogfood3-target/index.md` with `E_PATH_ESCAPE`. It also rejected
`docs/scratch/index.md`. The resolver accepts the default configured root
`docs/explanations`, so the scratch document had to live under
`docs/explanations/scratch`. The error is correct, but the command does not
state the configured roots or suggest a valid path. A user who follows an
ordinary scratch-directory workflow can spend time creating an unusable bundle.

Follow-up: `assertInsideRoots` now names the configured roots and gives a
path such as `docs/explanations/<document>/index.md`. A unit test covers the
default root and a custom `notes` root. The check keeps the same root
confinement and does not change resolution behavior.

## Final refresh

The registry follow-up changed the origin hash of `src_locate`. I recaptured
that source from the final current working tree with
`capture git --working-tree --recapture`. The final target source revision is
`f51356903e08f610e3afa19c0303826fbcd2b71d3eacbcfee909011891ed09a9`.

The review implementation measured 706 main-path words and 40 words before
the first figure, `id_map`. The page has 4 figures, 99 targets, and 0 review
prompts.

The first failed refresh also rejected a guessed `--expected-current` before it
reached the acknowledgement check. The CLI printed the actual revision. This
is correct, but a JSON resolve example in the handoff guide would make command
composition less error-prone.

The sandbox blocked Node child-process spawning. The authorized CLI checks and
captures ran outside the sandbox. This was an execution-environment constraint,
not a toolkit defect.
