# Remaining limitations of the first release

Status on 27 September 2026, after Phase 5 (spec revision 1.20). Every item
below is a known gap. None of them is hidden behind a passing test.

## Human validation gates (open)

- **Comprehension (R16).** The trial is prepared in
  `comprehension-trial.md` and `trial/`, but no participant has taken it.
  Explain makes no claim that it improves comprehension.
- **Touch devices (R05).** Definitions open on tap in emulated narrow
  viewports only. Nobody has checked them on a real touch device.
- See `human-gates.md` for the full list.

## Measured timing notes

- **First Mermaid figure: about 9.4 s** on a throttled mobile profile, because
  `mermaid.js` is 1.6 MB even with gzip. Pages without Mermaid do not load that
  file. (The initial usable page meets its 2 s target: 635.5 ms with gzip.)
- The build time came from a desktop machine, not from the laptop that §2.3
  names. See `budgets.md` for the hardware.

## Extensions (R15, partial)

- Extensions run at build time only (`browserEntry` must be `null`).
- A `part` has no relationships, so an extension cannot express relationship
  tuples.
- No browser test covers a page that contains an extension.
- `doctor` does not report installed extensions. `check` does not warn when a
  used extension is missing or untrusted; `build` does.
- An extension build entry runs with the user's operating-system privileges.
  The worker process limits time and memory, but it is not a sandbox (§14.3).

## Distribution

- `install --from-release` was tested only against local HTTPS servers with a
  test certificate authority. It was never run against the real GitHub hosts.
- `upgrade` writes `origin: local-dir` to the lock, so the lock does not record
  where the toolkit was downloaded from.
- The user shim verifies a release and then executes it. A local process that
  can write the user's toolchain folder between those two steps can change
  what runs (§12.4, revision 1.18).
- The user shim is 336 KB, because it bundles the schema validator.
- `vendor` and `content import` are deferred beyond v1 and exit with
  `E_UNSUPPORTED`.

## Authoring and checks

- No author input is known to produce `E_SPAN_UNPROVEN`. The code keeps it as
  a defensive check.
- `export --format markdown` still loads the document without the semantic
  validation that `check` and `build` now run.
- `--include-source` copies `index.md` unchanged, so whole-line Mermaid `%%`
  comments stay in the labelled source bundle.
- The review prompts are fixed rules, not a reviewer. They do not detect a
  main sentence whose conclusion a hidden caveat invalidates.
- The catalogue guides do not have every section in the §9.1 list: their
  attribute tables come from the checker, and they have no text-projection
  example.
