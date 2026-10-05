# Dotfiles Sol authoring trial

## Scope and baseline

- Reader: experienced engineer new to this repository. The reader already knows shell startup modes, symbolic links, and package managers.
- Evidence checkout: `/tmp/visser-dotfiles-evaluation`, Git commit `abc1e037fdd7d223e796a0703caa23034a9e21dd`, read only. No source script was run.
- Visser development toolkit digest: `6b10d157617182d35a94f239f4f9430f63a1960d4190a5ef0600995cad097833`.
- Canonical source: `document/index.md`; first structurally valid draft: `first-draft.md`; Markdown export: `export.md`.
- Build: `/tmp/visser-dotfiles-initial/d/cc3d4548-9254-4d8e-846a-8534ab91a540/039a4badd35859080b9445281dcaa7a22857eb144d33de55255b289ba00fa962/92671a0eab45831720b160476a7f6a907a0a47a24362026909d0a60b760889d1/index.html`.

## Expected answers, kept out of reader artifact

1. An unattended rootless Ubuntu container: `--unattended` sets `DOTFILES_CONTAINER=true` and `DOTFILES_INTERACTIVE=false` before `common.sh` (install.sh 3-14). The container flag makes fonts skipped by default (install.sh 16-24), and rootlessness skips system package installation and `chsh` (install.sh 20-23, 54-64; zsh/install.sh 167-178). The rootless branch requires preinstalled zsh (zsh/install.sh 19-25); `curl` and `git` are required before their later use because installation skips them. `uv` must be available or install successfully (install.sh 66-103). The script still configures zsh and links (install.sh 105-106; zsh/install.sh 140-160). Container detection by itself does not set `DOTFILES_INTERACTIVE=false`; non-terminal stdin does (common.sh 8-18).
2. Install links the tracked `.zshenv`, `.zshrc`, `.zprofile`, and `.zimrc` into `TARGET_HOME`; it also links Starship and lsd config (zsh/install.sh 140-160). `.zshenv` adds user paths and sources readable `.zshenv.local` for each zsh invocation (zsh/.zshenv 1-25). `.zprofile` sets Homebrew environment and sources `.zprofile.local` on login (zsh/.zprofile 1-12). `.zshrc` loads Zim and direnv before Starship; it sources readable `.zshrc.local` near its end (zsh/.zshrc 8-46, 86-87). The source code does not prove the effect of an arbitrary local file's contents.
3. `update.sh` selects package/tool update branches, updates fzf/uv/thefuck/Zim/theme, and checks only the Starship and lsd links against expected targets (update.sh 7-158). If a checked link is absent or points elsewhere, it reports a mismatch and says to rerun install. It does not recreate links (contrast zsh/install.sh 140-160). It does not check `.zshrc`, `.zshenv`, `.zprofile`, or `.zimrc` links. It also does not pull this dotfiles repository; that conclusion follows from the complete `update.sh` read, not an isolated excerpt.

## Outline and representation choice

| Section | Question | Intended answer | Representation | Likely misreading |
|---|---|---|---|---|
| Installation delegates shell setup | Who selects target and creates home links? | Entry script loads common, invokes shell installer, and sets Git defaults. | Architecture graph plus concise path prose, about 230 words. | Left-to-right graph geometry implies execution order. Legend explicitly denies it. |
| Terminal input, root access, and flags | Which branches run for a sample container? | Flags, terminal input, and privilege checks have distinct effects. | Four-row table and worked scenario, about 200 words. | Container detection itself disables prompts. |
| Linked files | Which startup scope and local extension applies? | All-shell, login, interactive scope differ. | Three-row table, about 190 words. | All local files run in every shell. |
| Update | What does update change or repair? | Tools change; selected links are only checked. | Prose, about 130 words. | Update recreates links. |

The graph is a responsibility map, not a trace. The other relationships fit tables or prose. `e_link` is the only authored part body: it answers the follow-up question, “What happens if the checkout path changes?” `d_revision` answers whether the snapshot describes later revisions.

## Staged author review

- **R1, `t_branches`: fixed.** A generic “container install skips prompts” reading conflicts with common.sh 8-18; only `--unattended` or input without an attached terminal disables prompts. The table separates these conditions.
- **R1, `p_update_links`: checked.** The complete update.sh has verification branches but no link creation. The main path says this and names the checked link types. A missing `.zshrc` link is not covered by the checks.
- **R1, `p_decisions`: checked.** The article uses `SUDO_USER` specifically for the sudo branch; it does not claim every root execution has a non-root target.
- **R2, `h_decisions` and `t_branches`: fixed.** Review lint flagged two uses of “TTY” without a definition. Replaced them with “terminal input” and “attached terminal.” Review check then returned zero prompts.
- **R3, `g_install`: source inspection only.** Each arrow has an action label and evidence. The legend rules out a sequence reading. Rendered diagram review at 1440, 390, and 320 CSS px remains for the parent.
- **R4, `e_link`: checked in source and Markdown export.** The body adds a checkout-path consequence beyond the edge label. The snapshot detail defines the evidence limit. Live click and close behavior remains for the parent.
- **R5 cold read:** pending parent-led fresh review. No self-check has been passed off as independent reader evidence.

## Checks and workflow friction

- `visser skill show --dev-toolkit dist/release` matched the repository skill text.
- `visser capture git` required `--doc .../index.md`; passing the document directory returned `E_SOURCE_UNAVAILABLE: cannot read the document`.
- The initial `capture git` child process received `spawnSync git EPERM` under the default sandbox. Read-only escalated captures succeeded; all excerpts report commit `abc1e037...` and generated hashes. This is a permission friction point, not a source change.
- Initial graph syntax had four bodyless `node` tags without `/%}`. `visser check` produced cascading Markdoc errors. Changed those nodes to self-closing tags; `check` then passed.
- `visser ids assign` refused the malformed graph before `check` identified the exact lines. This command sequence was less helpful than running `check` directly on malformed source.
- `visser check ... --review` passed with 43 targets and 0 prompts after the terminology correction.
- `visser build` succeeded with a development-toolkit warning, as expected for `--no-lock`. No browser or rendered visual claim is made here.
- `visser export ... --format markdown` succeeded. I inspected the first 120 lines: graph edges, branch conditions, startup qualifications, update caveat, and detail text survive in the text projection. Full export and browser review remain for the parent.

## Material limits

The document explains code paths, not successful execution in a real host. No installer, update script, remote installer, or sourced dotfiles file ran. The snapshot covers the pinned commit only. If the parent changes the document, it must rebuild and rerun affected checks.

## Revision after frozen independent review

The initial build listed above is a stale snapshot of `039a4badd35859080b9445281dcaa7a22857eb144d33de55255b289ba00fa962`. The revised source has revision `8578e1e6258a339e46b2dd97f9f9dbfe6406f2d232607edac5e4e3963b23c64a` and build ID `2e17f81389a704ce78979ae4bb7610f508d71c0fff74693158552de486ddcf4d`. Its development build is `/tmp/visser-dotfiles-revised/d/cc3d4548-9254-4d8e-846a-8534ab91a540/8578e1e6258a339e46b2dd97f9f9dbfe6406f2d232607edac5e4e3963b23c64a/2e17f81389a704ce78979ae4bb7610f508d71c0fff74693158552de486ddcf4d/index.html`. `first-draft.md` and `pre-review.md` were not edited by this revision.

### Corrections and reasons

- **R1 `p_install_path`: fixed.** The earlier sentence scoped package installation only by root access. `install.sh` 42-64 shows Homebrew installation on macOS independently of `CAN_ROOT`; Linux branches use `CAN_ROOT`. The revised paragraph separates those paths and states the `uv` gate from lines 88-106. A nonempty `UV_SKIP_INSTALL` suppresses the installer attempt, but the later availability check still runs.
- **R1 `p_decisions`, `t_branches`: fixed.** The earlier phrase “root access is available” hid the actual test. `common.sh` 90-108 sets `CAN_ROOT` for UID zero or a successful `sudo -n true`. The revised text says “without prompting”; it does not equate this with a permanent passwordless-sudo configuration. The no-root table row now names Linux. Lines 110-123 support the `SUDO_USER` lookup and the separate `USER`/`HOME` fallback.
- **R1 `p_example`: fixed.** The earlier example implied that `--unattended` forces fonts off. `install.sh` 16-24 shows the font flag defaults from the container flag but accepts an explicit nonempty override. The revised example states its default-feature assumption and the `DOTFILES_SKIP_FONTS=false` exception.
- **R1 `p_linkset`: fixed.** `zsh/install.sh` 140-160 invokes `ln -sfn` at each destination without a backup step. The paragraph now explains the effect on existing regular files or symbolic links on a successful command. It makes no directory-replacement claim.
- **R1 `p_update`: fixed.** The complete `update.sh` 1-158 has no pull of the dotfiles checkout. The paragraph now says that. `common.sh` 146-153 and `update.sh` 68-95 support the distinction between fzf checkout of a configured ref and `uv self update`.
- **R2/R4 `n_entry`, `n_shell_install`, `n_git`, `n_common`: fixed.** A cold reader lacked the `uv` failure gate, rootless paths, and scope of Git defaults. The new bodies answer those follow-ups with cited source excerpts. `n_common` adds the existing-`MACHINE` precedence. The `e_link` body remains because moving the checkout changes what its links point to.
- **R3 `h_owners`, `g_install`: adjusted for the reported 320 px stack.** The heading and figure title are shorter and serve separate functions. The graph still names responsibility, while its short legend prevents a chronology reading. The parent must recheck the revised render at 1440, 390, and 320 CSS px; source review alone does not verify spacing.
- **R4 `export.md`: re-exported.** I inspected the revised projection's main article and graph text. It preserves the new privilege, font, link-replacement, and update qualifications. The parent still owns fresh interaction and cold-reader checks.

The revised `visser check --review` reports 47 targets and zero prompts. `visser build` and Markdown export succeeded with the unchanged development toolkit digest `6b10d157617182d35a94f239f4f9430f63a1960d4190a5ef0600995cad097833`. Three new committed excerpts (`src_versions`, `src_rootless_tools`, `src_update_full`) came from the pinned read-only checkout through `capture git`.
