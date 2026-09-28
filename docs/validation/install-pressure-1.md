# Install pressure test 1

Date: 27 September 2026. Commit: `0f6959a`. Tester: a Claude Opus 5.5 fork, acting as a new user and as an adversary.

This report records one round of tests of Visser installation. The tests used only temporary homes (`HOME`, `VISSER_HOME`) and temporary repositories. One test wrote to the real home by mistake; the section "Incidents" describes it.

## Environment

| Item | Value |
|---|---|
| OS | Pop!_OS 24.04, Linux 6.17.9 |
| Node | v24.21.0 (npm 11.12.1) |
| File systems | ext4 for the repository and homes; tmpfs for `/dev/shm` |
| Source | a `git clone` of the local repository at `0f6959a` |
| Network | none; `--from-release` used a local HTTPS mock (`VISSER_TEST_API_BASE`, `VISSER_TEST_CA_FILE`) with a test CA made by openssl |
| Probe scripts | `scratchpad/install2/p1.sh` to `p9.sh`, `sig.sh`, `mock.mjs`, `mkrel.mts`, `mkarch.mts` |

Test releases: `mkrel.mts` copied `dist/release`, changed `browser/reader.css`, set the version, and signed `release.json` again. Versions 0.1.0 and 0.2.0 are valid. Version 0.3.0 has an unlisted file, 0.4.0 has a symlinked `bin/visser.cjs`, 0.5.0 has a changed file, and 0.6.0 has no `bin/shim.cjs`.

## Summary

- 108 checks: 94 passed, 14 failed. Three problems (m3, m8, m9) come from checks that passed or are notes.
- 7 major problems, 9 minor problems, no blockers.
- Every security check passed: digests, archive rejection, the trust gate for repository toolchains, TLS, redirect limits, the size cap, and token handling.
- The failures are about recovery, signals, and where Visser decides a "repository" starts.
- The README commands all worked as written. The README is missing information; see "README corrections".

## What was tested

### Part 1: new user, README only

| # | Step | Result |
|---|---|---|
| 1 | `npm ci --offline` in a fresh clone | Pass (0 vulnerabilities) |
| 2 | `npm run build` | Pass (52 files) |
| 3 | `install --from-dir dist/release --scope user --default` | Pass; prints the shim path and "PATH and shell startup files were not changed." |
| 4 | `visser` with no arguments | Pass: prints the command list, exit 2 |
| 5 | `visser --help` | Pass: the same list, exit 0. There is no text for each command. |
| 6 | `visser help`, `visser --version` | Fail (m6): `E_USAGE: unknown command` |
| 7 | `init`, `ids assign`, `check`, `check --review` | Pass |
| 8 | `build` (output in `REPO/.visser/output`) | Pass |
| 9 | `serve` (port 4310, loopback, gzip) | Pass |
| 10 | Stop `serve` with SIGINT to the shim PID | Fail (M1): the child server keeps running on port 4310 |
| 11 | `export --format site --out site` | Pass |
| 12 | `skill show`, `catalogue list`, `catalogue show trace --part template`, `doctor` | Pass |

### Part 2a: lifecycle

| # | Check | Result |
|---|---|---|
| 13 | Install 0.1.0 with `--default`, then 0.2.0 without it: the shim and the default do not change | Pass |
| 14 | Install the same release again: "already installed" | Pass |
| 15 | `--default` on an installed release switches the default and replaces the shim | Pass (2 checks) |
| 16 | `init` pins the default toolkit (0.1.0) | Pass |
| 17 | `check --release`, `build` | Pass (2) |
| 18 | `upgrade --dry-run` writes nothing and prints the diff | Pass |
| 19 | `upgrade --to 0.2.0` rebuilds with the target | Pass |
| 20 | `upgrade` back to 0.1.0: `E_DOWNGRADE`; with `--allow-downgrade`: done; again: "nothing to do" | Pass (3) |
| 21 | `check --release --dev-toolkit`: `E_USAGE` | Pass |
| 22 | `upgrade` to an unknown digest (`E_TOOLKIT_MISSING`) or a bad digest (`E_USAGE`) | Pass (2) |
| 23 | Repository install; trusted by install; resolves as `repository` | Pass (2) |
| 24 | `trust toolkit --revoke` blocks the repository copy (`E_TOOLKIT_UNTRUSTED`); `trust toolkit` restores it | Pass (2) |
| 25 | `trust toolkit NOTADIGEST`: `E_USAGE` | Pass |
| 26 | `skill show --doc --json` names the resolved toolkit | Pass |
| 27 | `trust toolkit --revoke` on a user-scope toolkit | Fail (m1): says "revoked", but the toolkit still runs |
| 28 | `doctor --doc` for a document whose repository copy is untrusted | Fail (M3): `doctor` itself stops with `E_TOOLKIT_UNTRUSTED` |
| 29 | An untrusted repository copy while the same digest is installed for the user | Note (m8): blocked; the user copy is not used |

### Part 2b: archives and bad releases

| # | Check | Result |
|---|---|---|
| 30 | `npm run release:pack`, and a second pack: same bytes | Pass (2) |
| 31 | `--archive` with the right `--sha256` | Pass |
| 32 | `--archive` with a wrong `--sha256`: "nothing was extracted" | Pass |
| 33 | `--archive` without `--sha256` | Fail (m4): installed and trusted with no warning |
| 34 | `--sha256` in upper case | Fail (m5): `E_USAGE` |
| 35 | Short `--sha256`; truncated archive; text file; directory; missing file | Pass (5) |
| 36 | Archive of a changed release; archive with an unlisted file | Pass (2): `E_INTEGRITY`, nothing left |
| 37 | `--from-dir` with an unlisted file, a symlink, a changed file, a missing path | Pass (4) |
| 38 | Release without `bin/shim.cjs`: kept the existing shim; with no shim: refused, nothing installed | Pass (2) |
| 39 | Usage errors (no source, two sources, no scope, bad scope) | Pass (4) |

### Part 2c: `install --from-release` against the local mock

| # | Check | Result |
|---|---|---|
| 40 | Success, and a second run with `v0.0.0` ("already installed") | Pass (2) |
| 41 | Wrong digest: "nothing was extracted" | Pass |
| 42 | The archive holds another version: refused | Pass |
| 43 | Release not found: `E_TOOLKIT_MISSING`; a version that is not semver: `E_USAGE` | Pass (2) |
| 44 | 4 redirects; a redirect to a host that is not allowed; a redirect to `http:` | Pass (3) |
| 45 | `Content-Length` over 64 MiB | Pass |
| 46 | `octo/..`, `octo`, missing `--sha256` | Pass (3) |
| 47 | A server that never answers: `E_SOURCE_UNAVAILABLE` after 30 s | Pass |
| 48 | Asset host not in `distributionHosts` | Pass |
| 49 | A certificate that the test CA did not sign, with and without `VISSER_TEST_CA_FILE` | Pass (2) |
| 50 | Token audit: 0 in output, 0 in files, sent only to the API host (21 requests), never to the asset host; the signed query never printed | Pass (4) |

### Part 2d: environment

| # | Check | Result |
|---|---|---|
| 51 | `VISSER_HOME` with spaces and non-ASCII characters: install, init, build, doctor | Pass (4) |
| 52 | Relative `VISSER_HOME` | Fail (M6) |
| 53 | Empty `VISSER_HOME` | Fail (m2): internal error, `mkdir ''` |
| 54 | `HOME` and `VISSER_HOME` unset: `doctor` | Pass. Install then uses the home from the password file (see "Incidents") |
| 55 | Read-only `VISSER_HOME`: install, trust, a second install | Fail (m2): 3 internal errors with stack traces |
| 56 | `VISSER_HOME` on tmpfs (another file system): 3 installs | Pass (3) |
| 57 | Stale `trust.json.lock` from a dead process | Pass as designed (refused after 5 s), but see m3 |
| 58 | Two concurrent installs of one release; of two releases with `--default` | Pass (2) |
| 59 | SIGKILL at 7 points, and SIGINT, during install | Fail (M7): `.staging-*` folders stay; `doctor` fails |
| 60 | Repository toolchain with an extra file, a symlinked file, a symlinked folder | Pass (3): `E_INTEGRITY` |
| 61 | Pinned user toolchain deleted by hand: `check` gives an install hint | Pass |
| 62 | Default toolchain deleted: `install`, `trust`, `doctor`, `skill show`, `catalogue list` through the shim | Fail (M2) |
| 63 | Uninstall | Fail (m7): no command, no hint |
| 64 | A document in a folder that is not a Git repository | Fail (M5) |
| 65 | A document under `HOME`, outside any repository | Fail (M4) |

## Problems

### Major

**M1. The shim does not pass signals to the toolkit process.**
- Commands: `node ~/.visser/bin/visser.cjs serve DOC & P=$!; kill -TERM $P` (the same with INT and HUP).
- Result: the shim exits, and its child `visser.cjs serve` keeps running and keeps the port. A process-group SIGINT (Ctrl-C in a terminal) stops both.
- Expected: a signal to the shim stops the toolkit process too. Agent tools and job managers often stop a process by its PID, and a private page then stays served.
- Fix: in `packages/cli/src/shim.ts`, use `spawn` instead of `spawnSync`, forward SIGINT, SIGTERM, and SIGHUP to the child, and exit with the child's code or signal.

**M2. The shim cannot run the recovery commands when the default toolchain is missing.**
- Commands: delete `~/.visser/toolchains/DEFAULT_DIGEST`, then `visser install --from-dir REL --scope user`, `visser trust toolkit …`, `visser doctor`.
- Result: each stops with `E_TOOLKIT_MISSING: toolkit … is not installed; … install one with: visser install --from-dir PATH --scope user`. That advice itself fails.
- Expected: `install`, `trust`, and `doctor` work without any toolkit, or the message names a command that works.
- Fix: in `shim.ts`, when the default toolchain is missing, run `install`, `trust`, and `doctor` with the newest verified user toolchain, or say "run `node PATH/dist/release/bin/visser.cjs install …`". Document the recovery in the README.

**M3. `doctor --doc` fails with the error it should explain.**
- Command: `visser doctor --doc DOC` when the document's repository copy is untrusted or missing.
- Result: `E_TOOLKIT_UNTRUSTED` or `E_TOOLKIT_MISSING`, exit 4 or 3. The skill tells agents to run `doctor` in exactly this case.
- Expected: the doctor report, with the document line showing the problem.
- Fix: in `shim.ts`, never resolve `doctor`, `install`, or `trust` by the document; always use the user default (see M2).

**M4. `~/.visser` makes `HOME` a "repository".**
- Commands: `cd ~/notes; visser init docs/explanations/q …; visser build …; visser refs show …`, with `~/notes` outside any Git repository.
- Result: the build writes to `~/.visser/output`, inside the user store. `refs show` gives `E_PATH_ESCAPE`. `doctor` lists each user toolchain a second time as a "repository" toolchain. When `~/.visser/config.json` holds `distributionHosts` or `publicRepositories`, `refs show` fails with `E_SYNTAX: .visser/config.json … must have required property 'schema'`, and `doctor` reports "problems found".
- Cause: `findRepoRoot` and `repoRootFor` treat any ancestor with `.visser` as a repository, and the user home and a workspace both use `.visser/config.json`.
- Fix: in `packages/core/src/references/registry.ts` and `packages/cli/src/commands/build.ts`, skip the folder whose `.visser` is `VISSER_HOME`. Better: give the workspace marker another file name, for example `.visser/workspace.json`.

**M5. The repository search climbs to any ancestor, including shared folders.**
- Commands: a document in `/tmp/claude-…/nogit/docs/explanations/q`, then `visser build`.
- Result: `out: /tmp/.visser/output`. The search found an old `/tmp/.git` and wrote the private build output into the shared `/tmp`. Another local user who creates `/tmp/.visser` first controls where the output goes.
- Expected: output next to the document, or a refusal that asks for `--out` or `--root`.
- Fix: in `repoRootFor` and `findRepoRoot`, stop at the user's home and at folders that other users can write (mode `o+w` or another owner), or require an explicit root outside a repository.

**M6. A relative `VISSER_HOME` breaks the installation.**
- Commands: `cd /tmp/x; VISSER_HOME=relhome/.visser visser install … --default`, then `cd REPO; node /tmp/x/relhome/.visser/bin/visser.cjs check DOC`.
- Result: install succeeds and prints `run: node relhome/.visser/bin/visser.cjs`. The later command looks in `REPO/relhome/.visser` and gives `E_TOOLKIT_MISSING`.
- Fix: in `packages/core/src/distribution/trust.ts` (`visserHome`) and `export/user-config.ts`, refuse a relative `VISSER_HOME` with `E_USAGE`, or resolve it once and print the absolute path.

**M7. An interrupted install leaves a staging folder, and `doctor` then fails.**
- Commands: `visser install --from-dir REL --scope user & sleep 0.15; kill -KILL $!` (and `kill -INT`).
- Result: `~/.visser/toolchains/.staging-*` stays. The next install does not remove it. `doctor` prints `toolchain user .staging-…: corrupt E_INTEGRITY …` and exits 3, with no advice.
- Fix: in `packages/core/src/distribution/install.ts`, remove the staging folder on SIGINT and SIGTERM, and remove `.staging-*` folders older than a few minutes at the start of each install. In `packages/cli/src/commands/doctor.ts`, list staging folders as leftovers with the command to remove them, not as corrupt toolchains.

### Minor

**m1. `trust toolkit --revoke` on a user-scope toolkit changes nothing.** The command prints "revoked trust in toolkit …", but user toolchains never read the trust store, so the toolkit still runs. Fix: in `packages/cli/src/commands/trust.ts`, add "trust applies only to repository copies; to stop using a user toolkit, remove `~/.visser/toolchains/DIGEST`".

**m2. File system errors show stack traces.** An empty `VISSER_HOME` gives `internal error: Error: ENOENT: … mkdir ''`. A read-only `VISSER_HOME` gives `internal error: Error: EACCES …` for install and trust. Fix: treat an empty `VISSER_HOME` as unset, and map `EACCES`, `EROFS`, and `ENOSPC` to a clear diagnostic with exit 3 in `install.ts` and `trust.ts`.

**m3. A stale trust lock fails the install after activation.** With a lock left by a dead process, install waits 5 s and exits 5 with `E_WRITE_CONFLICT`, but the toolchain is already active. The message shows the lock's PID; it could say that PID 999999 is not running. Fix: take the trust lock before activation, and check whether the holder PID is alive on the same host.

**m4. `--archive` without `--sha256` installs and trusts with no warning.** Fix: in `packages/cli/src/commands/install.ts`, print "the archive was not checked against a published digest" when `--sha256` is absent.

**m5. `--sha256` in upper case is refused.** Fix: lower-case the value before the check.

**m6. No help text for each command, and no `--version`.** `visser install --help` gives `E_USAGE: --scope must be user or repo`. Fix: in `packages/cli/src/main.ts` and `cli-util.ts`, handle `--help` before argument checks, and add `--version` from `release.json`.

**m7. No uninstall.** There is no command, and the README and `doctor` say nothing. A user must know to delete `~/.visser/toolchains/DIGEST`, `~/.visser/bin`, and `~/.visser/default`. Fix: document the manual steps in the README; optionally, add `visser uninstall DIGEST`.

**m8. An untrusted repository copy blocks, even when the same digest is installed for the user.** The files are identical by digest, but the shim stops with `E_TOOLKIT_UNTRUSTED`. Fix (optional, in `packages/cli/src/toolkit.ts`): use the user copy in that case and never read the repository copy.

**m9. With `HOME` unset, install writes to the password-file home.** This is normal Node behaviour, but a script that clears `HOME` to isolate a test still reaches the real home. Note only.

## README corrections

The README commands all ran as written. Add this information:

1. **An alias.** Give the exact line: `alias visser='node ~/.visser/bin/visser.cjs'`.
2. **`VISSER_HOME` must be an absolute path** (M6).
3. **Where documents must be.** `refs` commands work only inside a Git repository, under `docs/explanations` (the default root). Outside a repository, the build output can go to an ancestor folder (M4, M5).
4. **Stopping `serve`.** Use Ctrl-C. Stopping the shim by PID leaves the server running (M1).
5. **Recovery.** If a command says the default toolkit is missing, run the release's own CLI: `node dist/release/bin/visser.cjs install --from-dir dist/release --scope user --default` (M2).
6. **Uninstall.** Delete `~/.visser/toolchains/DIGEST` for one toolkit, or `~/.visser` for everything. Trust entries stay in `~/.visser/trust.json` until you run `visser trust toolkit DIGEST --revoke` (m7).
7. **After an interrupted install**, remove `~/.visser/toolchains/.staging-*` (M7).

## Incidents

- The test "HOME and VISSER_HOME unset" ran `install` and wrote to the real `/home/r/.visser`, because Node falls back to the home in the password file. The folder did not exist before the test. Every entry had the test's timestamp, and `trust.json` named only the test release, so the tester deleted `/home/r/.visser`. The real `~/.explain` was not touched.
- A build in a folder outside a Git repository created `/tmp/.visser/output` (M5). The tester checked that it held only that one build, and deleted it. `/tmp/.git` existed before the tests (dated 22 September); the tester did not touch it.
