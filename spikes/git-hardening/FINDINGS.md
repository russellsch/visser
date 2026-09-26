# Spike 4: Git capture hardening

**Result:** the §8.2 read path (`rev-parse --end-of-options`, then `cat-file blob`, with `--no-pager -c core.fsmonitor= -c core.hooksPath=/dev/null`) ran no hostile-repository code in any tested vector. Three gaps allowed a capture to read a different repository than the one it names. Spec revision 1.5 closes them.

**Environment:** Linux, Git 2.43.0, Node v25.9.0, no npm packages. Hostile fixture repositories live only in `tmp/` (gitignored).

**Reproduce:** `node attack.mjs && node unhardened.mjs`

## Execution vectors

"Naive" is a common command that an implementer might use. "Spec" is the §8.2 capture path.

| Vector | Naive command fires it | Spec path fires it |
|---|---|---|
| `core.fsmonitor`, also through `include.path` and `includeIf` | yes (`status`) | no |
| Hooks: post-checkout, reference-transaction, post-index-change | yes (`checkout`) | no |
| textconv | yes (`show --textconv`, `cat-file --textconv`); no for plain `show` | no |
| smudge filter | yes (`cat-file --filters`) | no |
| `diff.external` | yes (`diff`) | no |
| pager, editor, credential helper, sshCommand, gitProxy, alternateRefsCommand, packObjectsHook | no | no |
| Inherited `GIT_DIR` / `GIT_CONFIG_*` | yes: reads another repository | no, with an allowlisted environment |

## Redirection gaps (spec changes)

| Gap | Observed | Change |
|---|---|---|
| `.git` gitfile pointing to another repository | Capture returned `OTHER1\nOTHER2\n` from the other repository, labelled as the requested one. | Check `--absolute-git-dir` and `--show-toplevel` against the realpath of `--repo`. |
| `objects/info/alternates` outside the repository | A commit that exists only in the other repository resolved and was captured. | Refuse unless `--allow-alternates`; record the paths. |
| Inherited Git environment | A naive read followed a parent `GIT_DIR`. | Build the environment from an allowlist. |

## Are the `-c` flags and the index rule necessary?

`unhardened.mjs` runs the same checks without the flags. Without them, the capture path fired fsmonitor for the fsmonitor and `include.path` fixtures. `git status` ran the repository's clean filter even with the flags. Both the flags and the rule "never run a command that refreshes the index" are necessary.

## Option injection

`--output=…`, `-h`, `--exec=…`, and `--all` as `--rev` were rejected by the leading-dash check. `--end-of-options` alone also rejected them for `rev-parse` and `cat-file` on Git 2.43. A naive `git show --output=…` wrote the file. A path starting with `-` inside `<commit>:<path>` is safe.

## Correctness

All passed: SHA-256 object-format repository (64-character commit), detached HEAD, non-ASCII path with a space, CRLF kept raw with the §7.4 normalized hash, committed capture ignores a dirty working tree. Rejected as expected: range beyond EOF, empty excerpt, NUL byte, invalid UTF-8, a tree path, a working-tree symlink. A committed symlink blob was captured as its link-target text; the spec now rejects it.

**Not tested:** repositories owned by another user (`safe.directory`), network commands, Windows.
