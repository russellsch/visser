---
format: explain/1
docId: c2ab082b-4ca3-49c3-a119-c2d8d4bb552e
title: "How Explain works"
kind: teaching
capturedAt: 2026-09-27T22:37:53Z
visibility: private
---

<!-- ex:id overview -->
# How Explain works

<!-- ex:id p_summary -->
Explain turns a Markdown-like source file into a static web page whose every paragraph, figure part, and piece of evidence has a stable ID. A person reads the page; an LLM agent uses the IDs to change exactly one part of the source later. Three rules carry most of the design: the source is the only canonical copy, every build is an immutable snapshot, and only a toolkit that you installed or explicitly trusted runs code on your machine.

<!-- ex:id p_reading_path -->
This page follows one document through its life: the parts that take part, what `explain build` does, how an agent edits one paragraph safely, and why a cloned repository cannot run code on your machine. Each section ends with its limits.

{% definition id="def_bundle" term="source bundle" %}
A source bundle is a folder with one `index.md` and the files it declares. The `index.md` holds YAML frontmatter, prose with ID markers, and tags such as `graph`, `trace`, and `source`.
{% /definition %}

{% definition id="def_target" term="target" %}
A target is any part of a document that has an ID: a heading, a paragraph, a list, a figure, one node or edge of a figure, a definition, a detail, or a captured source.
{% /definition %}

{% definition id="def_toolkit" term="toolkit release" %}
A toolkit release is one folder that holds the CLI, the build workers, the browser assets, the schemas, and the agent skill, with a `release.json` that lists the sha256 of every file. The sha256 of that manifest is the toolkit digest.
{% /definition %}

{% definition id="def_packet" term="reference packet" %}
A reference packet is a small YAML record that names one target by document ID and target ID, at the source revision that the reader saw.
{% /definition %}

<!-- ex:id h_parts -->
## The parts and who calls whom

<!-- ex:id p_parts_intro -->
Explain has no server and no database. The pieces are files in two places: your repository, which anyone who can push to it controls, and your user folder, which only you control. The map below shows who calls or reads whom; it does not show order.

{% graph id="g_parts" mode="architecture" title="Who calls whom when you use Explain" question="Which parts does the repository control, and which part decides what code runs?" %}
Arrows are calls and reads. The user folder decides which code runs; the repository only supplies data.

{% group id="grp_repo" label="Your repository (repository-controlled)" %}
Anyone who can push to the repository can change these files.
{% /group %}

{% group id="grp_home" label="Your user folder, ~/.explain (user-controlled)" %}
Only you change these files, with `explain install` and `explain trust`.
{% /group %}

{% node id="n_agent" label="Author or agent" role="external" %}
A person or an LLM agent that runs `explain` commands.
{% /node %}

{% node id="n_bundle" group="grp_repo" label="Source bundle and lock" role="storage" %}
`index.md`, its declared files, and `explain.lock.json`, which pins one toolkit digest.
{% /node %}

{% node id="n_output" group="grp_repo" label="Snapshot output" role="storage" %}
`.explain/output/d/DOC/REVISION/BUILD/`: `index.html`, `document.md`, and `build.json`.
{% /node %}

{% node id="n_shim" group="grp_home" label="User shim" role="interface" %}
`~/.explain/bin/explain.cjs`, the only entry point that agents and wrappers call.
{% /node %}

{% node id="n_trust" group="grp_home" label="Trust store" role="storage" %}
`~/.explain/trust.json`: the toolkit and extension digests that you accepted.
{% /node %}

{% node id="n_cli" group="grp_home" label="Toolkit CLI and compiler" role="process" %}
The pinned release's own `bin/explain.cjs`, which parses, validates, and renders.
{% /node %}

{% node id="n_worker" group="grp_home" label="Layout worker" role="process" %}
A worker thread from the same release that computes graph layout with ELK.
{% /node %}

{% edge id="e_run" from="n_agent" to="n_shim" kind="call" label="runs every command through" /%}
{% edge id="e_read_lock" from="n_shim" to="n_bundle" kind="data" label="reads the pinned toolkit digest from" /%}
{% edge id="e_check_trust" from="n_shim" to="n_trust" kind="data" label="looks up a repository toolchain's digest in" /%}
{% edge id="e_exec" from="n_shim" to="n_cli" kind="call" label="verifies every file, then runs" /%}
{% edge id="e_parse" from="n_cli" to="n_bundle" kind="data" label="parses and validates" /%}
{% edge id="e_layout" from="n_cli" to="n_worker" kind="call" label="sends each graph for layout to" /%}
{% edge id="e_write" from="n_cli" to="n_output" kind="data" label="writes a new immutable snapshot to" /%}
{% /graph %}

<!-- ex:id p_parts_reader -->
The page itself needs no Explain process. `index.html` already holds all prose, the figure SVG, the relationship lists, and the evidence. The browser loads `reader.js` and `reader.css` from the toolkit's asset pack, and `reader.js` only adds inspection, the narrow-screen views, and a button that copies a reference packet. Without JavaScript the page is still complete.

<!-- ex:id p_parts_where -->
The toolkit usually lives in your user folder, under `~/.explain/toolchains/DIGEST/`. A repository may also ship a copy under `.explain/toolchains/DIGEST/`. If it does, the shim uses that copy only when its digest is in your trust store, and otherwise stops. The last section explains why.

<!-- ex:id h_build -->
## What `explain build` does

<!-- ex:id p_build_intro -->
A build is a pure function of three inputs: the declared source files, the toolkit digest, and the render options. The build hashes each input, so the snapshot folder name tells you exactly what produced it.

{% trace id="tr_build" title="One run of explain build" question="Which checks happen before any output is written, and whose code runs at each step?" %}
Nothing is written until every check has passed.

{% actor id="a_shim" entity="n_shim" /%}
{% actor id="a_cli" entity="n_cli" /%}
{% actor id="a_worker" entity="n_worker" /%}

{% event id="ev_select" actor="a_shim" label="Reads the lock and selects the pinned toolkit" kind="compute" /%}

{% event id="ev_verify" actor="a_shim" label="Verifies every release file against release.json" kind="compute" after=["ev_select"] %}
An unlisted, missing, changed, or symlinked file stops the command with `E_INTEGRITY`.
{% /event %}

{% event id="ev_spawn" actor="a_shim" to="a_cli" label="Runs the toolkit's own bin/explain.cjs" kind="call" after=["ev_verify"] /%}

{% event id="ev_parse" actor="a_cli" label="Parses index.md and builds the target records" kind="compute" after=["ev_spawn"] %}
Each target gets its exact byte span in the source and a `bodySha256` of its normalized text.
{% /event %}

{% event id="ev_validate" actor="a_cli" label="Validates frontmatter, IDs, references, and evidence hashes" kind="compute" after=["ev_parse"] /%}

{% branch id="br_invalid" label="Source has an error" condition="any error diagnostic" exclusiveWith=["br_valid"] /%}
{% branch id="br_valid" label="Source is valid" condition="no error diagnostic" exclusiveWith=["br_invalid"] /%}

{% event id="ev_stop" actor="a_cli" label="Prints the diagnostics and exits 2 without writing" kind="failure" after=["ev_validate"] branch="br_invalid" /%}

{% event id="ev_own" actor="a_cli" label="Checks that the lock pins this CLI's own digest" kind="compute" after=["ev_validate"] branch="br_valid" /%}

{% event id="ev_send" actor="a_cli" to="a_worker" label="Sends each graph to the layout worker" kind="call" after=["ev_own"] branch="br_valid" /%}

{% event id="ev_positions" actor="a_worker" to="a_cli" label="Returns node and edge positions" kind="return" after=["ev_send"] branch="br_valid" /%}

{% event id="ev_render" actor="a_cli" label="Renders HTML, SVG, and document.md" kind="compute" after=["ev_positions"] branch="br_valid" /%}

{% event id="ev_publish" actor="a_cli" label="Renames a temporary folder into the snapshot path" kind="state-change" after=["ev_render"] branch="br_valid" /%}
{% /trace %}

<!-- ex:id p_build_parse -->
The first steps are ordinary compiler work. The CLI parses `index.md` with a restricted Markdoc profile, validates the frontmatter against a schema, and turns every marked block and tag into a target record. {% cite ref="src_load" /%} Raw HTML, Markdoc variables, functions, and conditionals are rejected before anything renders, so a source file cannot run code in the build or in the page.

<!-- ex:id p_build_identity -->
Two hashes identify the result. The source revision is the sha256 of a canonical manifest that lists every declared file and its content hash. The build ID also covers the toolkit digest and the render options. The snapshot path `d/DOC/REVISION/BUILD/` is therefore different for any change of source or toolkit. The build ID also records whether the build is a development build. An existing snapshot folder is never replaced, so a reader can keep a page open while you build a new revision.

<!-- ex:id p_build_whose -->
Only the pinned toolkit's code runs. An installed CLI refuses to build a document whose lock pins a different digest, and tells you to use the user shim instead. {% cite ref="src_own_digest" /%} The layout worker comes from the same release as the running CLI, never from the document's folder. {% cite ref="src_workers" /%}

{% detail id="d_mermaid" label="Mermaid figures" summary="Parsed at build time in a separate process; drawn in the browser." %}
A `mermaid` figure is parsed at build time in a separate Node process with a 30-second limit, so its nodes get target IDs like any other figure. The browser draws it with the toolkit's `mermaid.js`, which loads only on pages that need it and only if its sha384 integrity digest matches. On a slow connection this file takes several seconds to arrive, because it is about 1.6 MB after compression; the text of the page is readable before that.
{% /detail %}

<!-- ex:id p_build_limits -->
Limits: the snapshot does not follow the codebase. A captured excerpt shows the code at the commit it names, and `explain check --verify-origins` tells you whether the local repository still has the same bytes. A build also refuses a graph above 200 nodes or 400 edges instead of drawing an unreadable figure.

<!-- ex:id h_edit -->
## How an agent changes exactly one paragraph

<!-- ex:id p_edit_intro -->
Headings and line numbers move when someone edits a file, so Explain never uses them to find a target. A {% term ref="def_packet" %}reference packet{% /term %} names the target by two IDs and carries two hashes: the source revision the reader saw, and the `bodySha256` of the target's text at that revision.

<!-- ex:id c_packet -->
```yaml
schema: explain-ref/1
docId: c2ab082b-4ca3-49c3-a119-c2d8d4bb552e
targetId: p_build_whose
sourceRevision: 3f1c…
bodySha256: 9a04…
label: "Only the pinned toolkit's code runs. An installed CLI refuses to build a docu"
kind: paragraph
issuedBy: browser
```

<!-- ex:id p_packet_note -->
The two hashes above are shortened; a real packet carries 64 hexadecimal characters for each. The label is only a hint: the first 80 characters of the target's text.

<!-- ex:id l_edit_steps -->
1. **Issue.** A reader clicks the reference button next to a block, or an agent runs `explain refs show DOC TARGET_ID`. Either way the packet comes from the built page or the current source, never from a guess.
2. **Resolve.** `explain refs resolve --packet FILE` finds the document by its ID, reparses it, and compares both hashes. It never writes.
3. **Replace.** `explain refs replace --packet FILE --replacement NEW.md --expected-revision REV` rewrites only the target's byte span. The replacement text must keep the target's ID marker.
4. **Check the result.** The agent runs `explain check` and rebuilds. The new build has a new revision, so old packets become stale on purpose.

<!-- ex:id p_edit_status -->
Resolution gives one of six statuses. `exact` means that the revision and the target text both match, and only `exact` allows a write. `stale` means that the document changed since the packet was issued; the result also says whether this target's own text changed. {% cite ref="src_stale" /%} `deleted`, `missing`, `ambiguous`, and `invalid` all stop the edit: the tool never picks the "closest" paragraph.

<!-- ex:id t_status -->
| Status | Meaning | What the agent does |
|---|---|---|
| `exact` | Revision and target text match | Replace the target |
| `stale`, text unchanged | Another part of the document changed | Refresh the packet, then replace |
| `stale`, text changed | The target itself changed | Show the user the current text; continue only if the request still applies |
| `deleted` | The target was retired | Report it and any named replacement |
| `missing`, `ambiguous`, `invalid` | No single safe target | Report it; never guess |

<!-- ex:id p_edit_guard -->
The write itself is guarded against a second writer. `refs replace` takes an exclusive edit lock for the document, reparses the file under the lock, and writes the new text to a temporary file. It validates the whole candidate document, then reads the original file once more and compares its raw hash with the bytes it started from. If they differ, it stops with `E_WRITE_CONFLICT` and writes nothing; otherwise it renames the temporary file over the original. {% cite ref="src_recheck" /%}

<!-- ex:id p_edit_limits -->
Limits: the guard protects the source file, not your intent. A packet for a stale target is refreshed only after an explicit acknowledgement, and the agent must show the user the changed text first. A direct edit with a text editor bypasses all of this; the next `check` still validates the result, but nothing compares it with a packet.

<!-- ex:id h_trust -->
## Why a cloned repository cannot run code on your machine

<!-- ex:id p_trust_intro -->
A repository that you clone controls its source bundles, its lock files, and any toolkit copy under `.explain/`. If Explain ran whatever the lock names, cloning a repository and running `explain build` would run the repository author's code. Three rules stop that.

<!-- ex:id l_trust_rules -->
- **Agents call only the user shim.** Agents and skill wrappers call `~/.explain/bin/explain.cjs`, which you installed. No command runs a repository's own shim or scripts.
- **A repository toolchain needs your trust.** If the repository ships a copy of the pinned toolkit under `.explain/toolchains/`, the shim looks up that digest in your trust store before it reads any file of the copy. An unknown digest stops with `E_TOOLKIT_UNTRUSTED` and prints the command to trust it after review. The shim does not fall back to another copy. {% cite ref="src_trust_gate" /%}
- **Every release is verified before it runs.** The shim checks that the release folder holds exactly the files in `release.json`, with matching hashes and no symlinks, and only then runs that release's own CLI. {% cite ref="src_shim" /%}

<!-- ex:id p_trust_data -->
Everything else that the repository supplies is data. The source cannot contain HTML or Markdoc code, captured excerpts are shown as text and never executed, and the lock, the workspace config, and collection files are read as regular files of at most 1 MiB without following symlinks.

<!-- ex:id p_trust_limits -->
The limits are real, and you should know them before you rely on this:

<!-- ex:id l_trust_limits -->
- Trust is a decision about a digest, not a review. After you trust a toolkit or an extension, its code runs with your operating-system privileges. The layout worker has a time limit, and an extension's build process has time and memory limits, but neither is a sandbox. A trusted extension can also load Node modules from folders outside its digest, so trust only extensions without outside dependencies.
- The shim verifies a release and then starts it. A process that can already write your user folder can change the files between those two steps. Explain accepts this, because such a process already runs as you.
- `--dev-toolkit PATH` runs whatever toolkit you name. It marks the build as a development build, and `check --release` and public exports refuse such builds.
- A public export trusts the repository names that sources record. The author controls those names, so the export report warns with `W_PUBLIC_BY_NAME` for each one.

{% detail id="d_install" label="How a toolkit gets into your user folder" summary="install verifies, stages, and renames; it never edits PATH." %}
`explain install --from-dir DIR`, `--archive FILE`, or `--from-release OWNER/REPO` stages the release in a temporary folder, verifies it, and renames it into `~/.explain/toolchains/DIGEST/`. An archive is read by a small tar reader that rejects the whole archive on any link, device, absolute path, `..`, or duplicate name. A download uses HTTPS only, allowed hosts only, a size cap, and a total deadline, and it checks the archive digest before extraction. Install records the digest in the trust store and never changes `PATH` or shell files.
{% /detail %}

<!-- ex:id h_next -->
## What to read next

<!-- ex:id p_next -->
To write a document, read `skills/explain/SKILL.md` and `skills/explain/references/format.md`. The full design, including every error code, is in `docs/ARCHITECTURE.md`, and the known gaps are in `docs/validation/limitations.md`. The human trial that would show whether these pages help readers understand faster has not run yet, so this page makes no such claim.

{% source id="src_load" kind="git" title="loadBundle parses, validates frontmatter, and builds targets" language="typescript" repository="https://github.com/russellsch/visser.git" commit="9fdeb259e45e088890a4df5dec2d3ff9e1cd59ac" file="packages/core/src/model/bundle.ts" start=51 end=66 capturedAt="2026-09-27T22:38:07Z" excerptSha256="99a8537ae55b5caf4feb19214ce28ba51a95849aa8ae3c5ada61b2e50f9f9278" originFileSha256="14b2ebdaa52708a70ab881116a102127dbe2f4720eb809806643380e003087d4" %}
```typescript
export function loadBundle(indexPath: string): LoadedBundle {
  const bytes = new Uint8Array(readFileSync(indexPath));
  const root = dirname(indexPath);
  const parsed = parseSource(bytes, 'index.md');
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];

  if (!parsed.diagnostics.some((d) => d.severity === 'error' && d.code === 'E_SYNTAX' && d.startLine === 1)) {
    const result = validateAgainst('frontmatter', parsed.frontmatter);
    if (!result.ok) {
      for (const error of result.errors) {
        diagnostics.push({ code: 'E_SYNTAX', severity: 'error', message: `frontmatter ${error}`, path: 'index.md', startLine: 1 });
      }
    }
  }
  const model = buildTargetRecords(parsed);
  diagnostics.push(...model.diagnostics);
```
{% /source %}

{% source id="src_own_digest" kind="git" title="A CLI refuses a document pinned to another toolkit" language="typescript" repository="https://github.com/russellsch/visser.git" commit="9fdeb259e45e088890a4df5dec2d3ff9e1cd59ac" file="packages/cli/src/toolkit.ts" start=258 end=266 capturedAt="2026-09-27T22:38:08Z" excerptSha256="ea0a80df54aa5c031b09d9057cad80854e8bf5954f63dba5ae7c25f36359e630" originFileSha256="0a4c51ae609932251bfae41463fbaeb468029ae6dc5826783182cd4caf94ba04" %}
```typescript
  if (own) {
    const ownRelease = selection.release.dir === resolve(own) ? selection.release : verifyRelease(own);
    if (ownRelease.sha256 !== selection.release.sha256) {
      throw devToolkit
        ? new CliError('E_USAGE', `--dev-toolkit ${selection.release.dir} is toolkit ${selection.release.sha256}, but this CLI is ${ownRelease.sha256}; run that toolkit's own bin/explain.cjs`, EXIT.invalid)
        : new CliError('E_TOOLKIT_MISSING', `the document pins toolkit ${selection.release.sha256}, but this CLI is ${ownRelease.sha256}; run the command through the user shim (\${EXPLAIN_HOME:-~/.explain}/bin/explain.cjs), which runs the pinned toolkit's own CLI`, EXIT.unavailable);
    }
    selection.workerRelease = ownRelease.dir;
  }
```
{% /source %}

{% source id="src_workers" kind="git" title="Layout workers come only from the running CLI's release" language="typescript" repository="https://github.com/russellsch/visser.git" commit="9fdeb259e45e088890a4df5dec2d3ff9e1cd59ac" file="packages/cli/src/commands/build.ts" start=66 end=69 capturedAt="2026-09-27T22:38:07Z" excerptSha256="9e882bbf6d8de82719671c107c7da4563a66b15a2c0734db8b3cf5310315fe12" originFileSha256="807b35e01437e2228df48eb41862887d9d0450be5840a6ec8703449d2511122b" %}
```typescript
    : undefined;
  // Workers come only from the running CLI's own release (§12.4 "Whose code
  // runs"); in source mode there is none, and layout runs in process.
  const workerPath = toolkit.workerRelease ? join(toolkit.workerRelease, 'workers', 'layout.cjs') : undefined;
```
{% /source %}

{% source id="src_stale" kind="git" title="exact versus stale resolution" language="typescript" repository="https://github.com/russellsch/visser.git" commit="9fdeb259e45e088890a4df5dec2d3ff9e1cd59ac" file="packages/core/src/references/resolve.ts" start=161 end=175 capturedAt="2026-09-27T22:38:08Z" excerptSha256="39f566ad034192fbdccfdd89d50d330f4e19da2bf098053fdcdf2a09aeb0e363" originFileSha256="d8580b7d1b09728b8a34128c67bb421a40c8fb74f843d61f564b434829821473" %}
```typescript
  let result: ResolveResult;
  if (packet.sourceRevision === currentRevision && bodyUnchanged) {
    result = { ...base, status: 'exact', currentRevision, targetBodyUnchanged: true, ...advisory, current: currentView(bundle, record), diagnostics: [] };
  } else if (packet.sourceRevision !== currentRevision) {
    result = {
      ...base,
      status: 'stale',
      currentRevision,
      targetBodyUnchanged: bodyUnchanged,
      ...advisory,
      current: currentView(bundle, record),
      diagnostics: [diag('E_REF_STALE', bodyUnchanged
        ? 'the document changed since the packet was copied; the target text is unchanged'
        : 'the document changed since the packet was copied, including the target text', { targetId: record.id, suggestedAction: 'reconcile, then run `explain refs refresh`' })],
    };
```
{% /source %}

{% source id="src_recheck" kind="git" title="Validate the candidate, recheck the raw file, then rename" language="typescript" repository="https://github.com/russellsch/visser.git" commit="9fdeb259e45e088890a4df5dec2d3ff9e1cd59ac" file="packages/core/src/references/guarded-write.ts" start=162 end=173 capturedAt="2026-09-27T22:38:09Z" excerptSha256="d20e57e098096878f28914d5af432a554c50c77c6caab8fdea4275e6bf64c727" originFileSha256="d61cb0e2249c182c14cc88ad6dda6785c311345a61c243137a3ee2abc907518b" %}
```typescript
    const after = loadBundle(tempPath);
    // The caller's check runs first: it can map a candidate error to a more
    // exact code (refs replace maps a duplicate ID to E_ID_RETENTION, §15.6).
    validate?.(after);
    const firstError = after.diagnostics.find((d) => d.severity === 'error');
    if (firstError) fail(firstError.code, `the edited document would not be valid: ${firstError.message}${firstError.startLine ? ` (line ${firstError.startLine})` : ''}`);

    opts.fsContext?.beforeRename?.(indexPath);
    if (lstatSync(indexPath).isSymbolicLink() || sha256Hex(new Uint8Array(readFileSync(indexPath))) !== rawHash) {
      fail('E_WRITE_CONFLICT', 'the document changed on disk during the edit; nothing was written');
    }
    renameSync(tempPath, indexPath);
```
{% /source %}

{% source id="src_trust_gate" kind="git" title="A repository toolchain needs the user's trust" language="typescript" repository="https://github.com/russellsch/visser.git" commit="9fdeb259e45e088890a4df5dec2d3ff9e1cd59ac" file="packages/cli/src/toolkit.ts" start=179 end=193 capturedAt="2026-09-27T22:38:07Z" excerptSha256="db9263e013086be75bb0b8a9ff1c1d01af63da3528567ea84b047c747b97ded4" originFileSha256="0a4c51ae609932251bfae41463fbaeb468029ae6dc5826783182cd4caf94ba04" %}
```typescript
  // 2. A repository toolchain is repository-controlled code: eligible only
  // when the user trusts its digest. The trust check reads nothing from it.
  if (opts.repoRoot) {
    const dir = join(opts.repoRoot, '.explain', 'toolchains', digest);
    if (present(dir)) {
      if (!trusted(digest, env)) {
        throw new CliError('E_TOOLKIT_UNTRUSTED', `the repository toolchain ${dir} (${digest}) is not in the user trust store; review it, then run: explain trust toolkit ${digest}`, EXIT.security);
      }
      const release = verifyCandidate(dir, digest, 'repository toolchain');
      if (!isInside(realpathSync(dir), realpathSync(opts.repoRoot))) {
        throw new CliError('E_INTEGRITY', `repository toolchain ${dir} resolves outside the repository`, EXIT.security);
      }
      return { release, source: 'repository' };
    }
  }
```
{% /source %}

{% source id="src_shim" kind="git" title="The user shim runs the selected toolkit's own CLI" language="typescript" repository="https://github.com/russellsch/visser.git" commit="9fdeb259e45e088890a4df5dec2d3ff9e1cd59ac" file="packages/cli/src/shim.ts" start=138 end=147 capturedAt="2026-09-27T22:38:08Z" excerptSha256="99b6f231a273d03f980db8a8ed1fe3197fd21fa4577f0463701bb41e7bf0408f" originFileSha256="199fbd4087bb23f841172d590d29865ae55f3337fd47b032d501fa541ad40883" %}
```typescript
export function shimMain(argv: string[], env: NodeJS.ProcessEnv = process.env): number {
  let release: VerifiedRelease;
  try {
    release = selectToolkit(argv, env);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    printDiagnostics([{ code: error.code, severity: 'error', message: error.message }], argv.includes('--json'));
    return error.exitCode;
  }
  const result = spawnSync(process.execPath, [join(release.dir, 'bin', 'explain.cjs'), ...argv], { stdio: 'inherit', env });
```
{% /source %}
