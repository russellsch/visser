# Visser

Visser is a toolkit that compiles technical explanations into static web pages. You write the explanation in restricted Markdoc. Visser produces HTML and SVG pages, and every paragraph, figure, and figure part gets a stable ID. An LLM agent can use these IDs to refer to an exact part of an explanation and to change only that part.

Visser helps a reader build a correct mental model of a system. Each claim links to its evidence, and the reader can open the evidence without losing their place.

## Requirements

- Node 24.
- Chromium, only for the browser tests. Visser does not test other browsers.

## Build from source

1. Install the dependencies:

   ```sh
   npm ci
   ```

2. Build the release:

   ```sh
   npm run build
   ```

The release goes to `dist/release`.

## Install

1. Install the release for your user, and make it the default toolkit:

   ```sh
   node dist/release/bin/visser.cjs install --from-dir dist/release --scope user --default
   ```

2. Run all later commands through the user shim at `~/.visser/bin/visser.cjs`. A later install replaces the shim only with `--default`. If `VISSER_HOME` is set, the shim is at `$VISSER_HOME/bin/visser.cjs`.

The installer does not change `PATH` or your shell startup files. To type `visser`, add this line to your shell startup file:

```sh
alias visser='node ~/.visser/bin/visser.cjs'
```

If you set `VISSER_HOME`, use an absolute path. Run `visser --help` for the commands and `visser --version` for the toolkit version.

If the default toolkit is missing, install it again with the release's own CLI:

```sh
node dist/release/bin/visser.cjs install --from-dir dist/release --scope user --default
```

To remove a toolkit, delete its folder, for example `rm -rf ~/.visser/toolchains/DIGEST`. `visser doctor` lists the installed toolkits and prints the removal command for leftovers of an interrupted install.

Other sources:

- `install --archive FILE [--sha256 DIGEST]` installs a packed release (`npm run release:pack`).
- `install --from-release OWNER/REPO --version VERSION --sha256 DIGEST` downloads a GitHub release and checks its digest before it extracts the archive.

## Upgrade guide

Visser separates two operations:

1. **Install a toolkit.** This makes verified release bytes available on the
   current machine. `--default` also selects it for new documents and commands
   that do not name a document.
2. **Upgrade a document.** This changes that document's `visser.lock.json` to
   an exact installed toolkit digest. Existing documents never follow the user
   default automatically.

This separation keeps a new global install from changing existing documents.
It also lets a repository review and commit each lock change.

### Upgrade from a source checkout

Build and install the new release:

```sh
npm ci
npm run build
node dist/release/bin/visser.cjs install \
  --from-dir dist/release --scope user --default
```

Copy the `toolkit digest` from the install output. Then preview the document
upgrade:

```sh
visser upgrade docs/explanations/queue/index.md \
  --to TOOLKIT_DIGEST --dry-run
```

The dry run uses the target toolkit to check the document. It prints the lock
diff but writes nothing. Apply the upgrade after you review that result:

```sh
visser upgrade docs/explanations/queue/index.md --to TOOLKIT_DIGEST
visser check docs/explanations/queue/index.md --release
```

The upgrade writes the lock with conflict checks and rebuilds the document.
Old build snapshots remain available. If the rebuild fails after the lock
write, fix the document with the new toolkit or deliberately downgrade it.

### Upgrade from a published release

Use the archive SHA-256 value published with the release:

```sh
visser install --from-release OWNER/REPO \
  --version VERSION --sha256 ARCHIVE_SHA256 \
  --scope user --default
```

The archive digest verifies the download. The installer prints a separate
`toolkit digest`; pass that toolkit digest to `visser upgrade --to`.

For an offline upgrade, download the release archive and run:

```sh
visser install --archive FILE --sha256 ARCHIVE_SHA256 \
  --scope user --default
```

### Upgrade several documents

First list the document locks in the repository:

```sh
find docs/explanations -name visser.lock.json -print
```

Run `visser upgrade DOC --to TOOLKIT_DIGEST --dry-run` for each document.
Apply the upgrades only after every dry run succeeds. Visser currently upgrades
one document at a time; it has no atomic repository-wide upgrade command.
Commit each changed `visser.lock.json` with any required document changes.

Every machine that builds the repository must install the locked toolkit.
User installations are local to one machine and are not stored in the
repository. Toolkit upgrades also do not change pinned extensions.

To move to an older toolkit, add `--allow-downgrade`. Use that flag only after
you confirm that the older toolkit accepts the document.

## Quick start

In these steps, `visser` means `node ~/.visser/bin/visser.cjs`. Run the steps inside a Git repository. The default document root is `docs/explanations`.

1. Create a document:

   ```sh
   visser init docs/explanations/queue --kind teaching --title "Bounded queue"
   ```

2. Write the explanation in `docs/explanations/queue/index.md`. Read `skills/visser-visual-explain/references/format.md` for the rules.

3. Add ID markers to new blocks:

   ```sh
   visser ids assign docs/explanations/queue/index.md
   ```

4. Check the document:

   ```sh
   visser check docs/explanations/queue/index.md
   ```

5. Optional: get editorial review prompts. The prompts are warnings and do not change the exit code.

   ```sh
   visser check --review docs/explanations/queue/index.md
   ```

6. Build the page:

   ```sh
   visser build docs/explanations/queue/index.md
   ```

   The output goes to `.visser/output` in the repository.

7. Read the page in a browser:

   ```sh
   visser serve docs/explanations/queue/index.md
   ```

   The server listens on `127.0.0.1:4310` by default. It prints the full URL of the page. Press Ctrl-C to stop it.

   | Flag | What it does |
   |---|---|
   | `--port N` | Listen on port N (`0` picks a free port). |
   | `--host H` | Listen on host H instead of `127.0.0.1`. |
   | `--public-origin URL` | Also accept this origin in the Host allowlist. |
   | `--base-path P` | Serve under path P instead of `/`. |
   | `--cache-private` | Cache the page like a public export, instead of `no-store`. |
   | `--watch` | Rebuild when `index.md`, `visser.lock.json`, or any declared bundle file changes, and keep serving the latest build at `<base-path>latest/`. A failed rebuild prints its error and keeps the previous build serving. |
   | `--toolkit-dir DIR` / `--dev-toolkit DIR` | Use this toolkit release instead of the locked one. |

8. Export one standalone HTML file:

   ```sh
   visser export docs/explanations/queue/index.md --out queue.html
   ```

   The file embeds its CSS, JavaScript, diagrams, and captured images, so it
   opens directly from disk and can move by itself. Export a static site with
   shared assets instead by adding `--format site --out site`. Exports never
   overwrite an existing file or a non-empty folder and publish nothing. Use
   `--audience public` for public material; a public export stops if it contains
   private material.

## References for agents

A reference packet is a small YAML record. It identifies one target by document ID, target ID, and source revision.

- `visser refs show DOC TARGET_ID` prints a packet for a target.
- `visser refs resolve --packet FILE` finds the target and tells you if it changed.
- `visser refs replace --packet FILE --replacement FILE --expected-revision REV` replaces one target. The replacement must keep the target's `<!-- vs:id ... -->` marker. The command stops if the document changed since the packet was issued.

## Agent skill

The skill for agents is in `skills/visser-visual-explain/SKILL.md`. The installed toolkit holds a copy.

- `visser skill show` prints the pinned skill and the paths to its guides.
- `visser catalogue list` lists the explanation patterns.
- `visser catalogue show NAME --part template` prints a template for one pattern.

## Tests

| Command | What it checks |
|---|---|
| `npm test` | Unit and integration tests |
| `npx playwright test` | Browser tests, default tier |
| `VISSER_BROWSER_TIER=full npx playwright test` | Browser tests, full tier |
| `npm run test:offline` | Build and read without a network (needs `unshare`) |
| `npm run test:budgets` | Size budgets |
| `npm run test:clean-machine` | Install and use from an empty home folder |
| `node scripts/check-contracts.mjs` | Hash vectors, JSON schemas, and traceability |

Run `check-contracts.mjs` after the full test runs, because it reads their reports.

## Documents

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the specification.
- [docs/REVISIONS.md](docs/REVISIONS.md): the history of the specification.
- [docs/validation/limitations.md](docs/validation/limitations.md): the known limitations.
- [docs/validation/budgets.md](docs/validation/budgets.md): the measured budgets.

## Status

The first-release functionality is complete. The human comprehension trial has not run. Visser makes no claim that it improves comprehension.
