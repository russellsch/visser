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

## Quick start

In these steps, `visser` means `node ~/.visser/bin/visser.cjs`. Run the steps inside a Git repository. The default document root is `docs/explanations`.

1. Create a document:

   ```sh
   visser init docs/explanations/queue --kind teaching --title "Bounded queue"
   ```

2. Write the explanation in `docs/explanations/queue/index.md`. Read `skills/visual-explain/references/format.md` for the rules.

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

8. Export a static site:

   ```sh
   visser export docs/explanations/queue/index.md --format site --out site
   ```

   The export writes only to a new or empty folder. It publishes nothing. Use `--audience public` for a public site. A public export stops if it contains private material.

## References for agents

A reference packet is a small YAML record. It identifies one target by document ID, target ID, and source revision.

- `visser refs show DOC TARGET_ID` prints a packet for a target.
- `visser refs resolve --packet FILE` finds the target and tells you if it changed.
- `visser refs replace --packet FILE --replacement FILE --expected-revision REV` replaces one target. The replacement must keep the target's `<!-- vs:id ... -->` marker. The command stops if the document changed since the packet was issued.

## Agent skill

The skill for agents is in `skills/visual-explain/SKILL.md`. The installed toolkit holds a copy.

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
