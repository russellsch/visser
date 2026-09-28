---
format: visser/1
docId: c2ab082b-4ca3-49c3-a119-c2d8d4bb552e
title: "How Visser works"
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [Markdown, Git, SHA-256]
  new: [target, source revision, reference packet, toolkit]
  mustUnderstand:
    - "Name the source revision, toolkit digest, extension digests, and render options that determine a build."
    - "Predict when a reference packet is exact, stale, or refused."
    - "Explain why a repository toolkit needs user trust before it runs."
visibility: private
retiredTargets:
  a_cli: {reason: "replaced by the focused build plan"}
  a_shim: {reason: "replaced by the focused build plan"}
  a_worker: {reason: "replaced by the focused build plan"}
  br_invalid: {reason: "replaced by the focused build plan"}
  br_valid: {reason: "replaced by the focused build plan"}
  d_install: {reason: "removed from the main path"}
  d_mermaid: {reason: "removed from the main path"}
  e_check_trust: {reason: "replaced by e_gate"}
  e_exec: {reason: "replaced by e_start"}
  e_layout: {reason: "replaced by e_start"}
  e_parse: {reason: "replaced by e_source"}
  e_read_lock: {reason: "replaced by e_lock"}
  e_run: {reason: "removed from the focused map"}
  e_write: {reason: "replaced by the build plan"}
  ev_own: {reason: "replaced by ev_select"}
  ev_positions: {reason: "replaced by ev_render"}
  ev_publish: {reason: "replaced by ev_render"}
  ev_send: {reason: "replaced by ev_render"}
  ev_spawn: {reason: "replaced by ev_select"}
  ev_stop: {reason: "replaced by ev_validate"}
  ev_verify: {reason: "replaced by ev_select"}
  h_trust: {reason: "merged into h_parts" , replacement: h_parts}
  l_edit_steps: {reason: "replaced by g_edit" , replacement: g_edit}
  l_trust_limits: {reason: "removed from the main path"}
  l_trust_rules: {reason: "merged into p_parts_reader" , replacement: p_parts_reader}
  n_agent: {reason: "removed from the focused map"}
  n_output: {reason: "replaced by ev_render"}
  n_worker: {reason: "merged into n_cli" , replacement: n_cli}
  p_build_intro: {reason: "merged into p_build_parse" , replacement: p_build_parse}
  p_build_limits: {reason: "removed from the main path"}
  p_edit_limits: {reason: "merged into p_edit_guard" , replacement: p_edit_guard}
  p_old_names: {reason: "stale rename note removed"}
  p_packet_note: {reason: "removed from the focused path"}
  p_parts_intro: {reason: "merged into p_parts_reader" , replacement: p_parts_reader}
  p_reading_path: {reason: "merged into p_summary" , replacement: p_summary}
  p_trust_data: {reason: "removed from the focused path"}
  p_trust_intro: {reason: "merged into p_parts_reader" , replacement: p_parts_reader}
  p_trust_limits: {reason: "removed from the focused path"}
  t_status: {reason: "merged into p_edit_status" , replacement: p_edit_status}
  code_map: {reason: "removed from the focused path"}
  t_core: {reason: "removed from the focused path"}
  t_bundle: {reason: "removed from the focused path"}
  t_resolve: {reason: "removed from the focused path"}
  t_guarded: {reason: "removed from the focused path"}
  t_cli: {reason: "removed from the focused path"}
  t_build: {reason: "removed from the focused path"}
  t_toolkit: {reason: "removed from the focused path"}
  t_shim: {reason: "removed from the focused path"}
  t_runtime: {reason: "removed from the focused path"}
  t_skill: {reason: "removed from the focused path"}
  src_own_digest: {reason: "stale unused source removed"}
  ev_packet: {reason: "replaced by numbered edit steps" , replacement: g_edit}
  ev_resolve: {reason: "replaced by numbered edit steps" , replacement: g_edit}
  ev_replace: {reason: "replaced by numbered edit steps" , replacement: g_edit}
  ev_rebuild: {reason: "replaced by numbered edit steps" , replacement: g_edit}
  dp_packet: {reason: "replaced by numbered edit steps" , replacement: g_edit}
  dp_exact: {reason: "replaced by numbered edit steps" , replacement: g_edit}
  dp_write: {reason: "replaced by numbered edit steps" , replacement: g_edit}
---

<!-- vs:id overview -->
# How Visser works

<!-- vs:id p_summary -->
Visser compiles one source bundle into a static snapshot. The source remains the canonical document. A reader uses the snapshot. An author changes the source and builds a new snapshot.

{% definition id="def_bundle" term="source bundle" %}
A source bundle is a folder with `index.md` and each file that `index.md` declares.
{% /definition %}

{% definition id="def_target" term="target" %}
A target is one addressable block or figure part with an ID that is unique in its document.
{% /definition %}

{% definition id="def_toolkit" term="toolkit" %}
A toolkit is the checked set of CLI, worker, and browser files that Visser runs.
{% /definition %}

{% definition id="def_packet" term="reference packet" %}
A reference packet names one target and records the source revision and target body hash that a reader saw.
{% /definition %}

{% definition id="def_revision" term="source revision" %}
A source revision is the hash of the canonical manifest of declared source files. Text files use normalized line endings. {% cite ref="src_revision" /%}
{% /definition %}

{% domain id="d_terms" title="Four records connect a build" question="Which records identify the source, the tool, and one later edit?" %}
Each record has one job. The map names relations, not execution order.

{% concept id="c_bundle" label="Source bundle" definition="def_bundle" category="thing" attributes=["document ID", "declared files"] /%}

{% concept id="c_target" label="Target" definition="def_target" category="thing" attributes=["target ID", "body hash"] /%}

{% concept id="c_toolkit" label="Toolkit" definition="def_toolkit" category="thing" attributes=["digest"] /%}

{% concept id="c_packet" label="Reference packet" definition="def_packet" category="value" attributes=["revision", "body hash"] /%}

{% relation id="r_bundle_target" from="c_bundle" to="c_target" kind="has" label="contains" cardinality="1..*" /%}
{% relation id="r_packet_target" from="c_packet" to="c_target" kind="identifies" label="names" cardinality="1" /%}
{% relation id="r_bundle_toolkit" from="c_bundle" to="c_toolkit" kind="uses" label="pins" cardinality="1" /%}
{% /domain %}

<!-- vs:id h_parts -->
## The shim selects the code

{% graph id="g_parts" mode="architecture" title="The shim selects the code" question="Which part selects the code, and where does the repository stop controlling it?" %}
Arrows show calls and reads. They do not show order.

{% group id="grp_repo" label="Repository files" %}
The repository supplies source data and may supply a toolkit copy.
{% /group %}

{% group id="grp_home" label="User files" %}
The user folder holds the shim, trust store, and installed toolkits.
{% /group %}

{% node id="n_bundle" group="grp_repo" label="Source bundle" role="storage" evidence=["src_load"] %}
The loader reads `index.md`, declared files, and the document lock.
{% /node %}

{% node id="n_repo_toolkit" group="grp_repo" label="Repository toolkit" role="process" evidence=["src_trust_gate"] %}
The repository may hold a candidate toolkit under `.visser/toolchains/`.
{% /node %}

{% node id="n_shim" group="grp_home" label="User shim" role="interface" evidence=["src_shim"] %}
The shim chooses a release before it starts a CLI.
{% /node %}

{% node id="n_trust" group="grp_home" label="Trust store" role="storage" %}
The trust store records digests that the user accepted.
{% /node %}

{% node id="n_cli" group="grp_home" label="Toolkit CLI" role="process" evidence=["src_workers"] %}
The selected release supplies the CLI and its layout worker.
{% /node %}

{% edge id="e_lock" from="n_shim" to="n_bundle" kind="data" label="reads the lock" /%}
{% edge id="e_gate" from="n_shim" to="n_trust" kind="data" label="checks the digest" /%}
{% edge id="e_repo" from="n_shim" to="n_repo_toolkit" kind="call" label="accepts trusted code" /%}
{% edge id="e_start" from="n_shim" to="n_cli" kind="call" label="starts selected CLI" /%}
{% edge id="e_source" from="n_cli" to="n_bundle" kind="data" label="loads source" /%}
{% /graph %}

<!-- vs:id p_parts_reader -->
Run all commands through the user shim. Repository contributors can change a candidate toolkit. The shim checks the candidate digest against user trust before it verifies and runs that copy. {% cite ref="src_shim" /%} {% cite ref="src_trust_gate" /%}

<!-- vs:id p_parts_where -->
An installed user copy can satisfy the same locked digest. The repository does not control that user copy. `--dev-toolkit PATH` is a developer bypass. It runs the named local release and marks builds as development builds.

<!-- vs:id h_build -->
## A build records its inputs

{% graph id="tr_build" mode="plan" title="A valid source enables a build" question="Which checks must pass before the CLI writes a snapshot?" %}
Arrows show requirements. They do not show duration.

{% task id="ev_select" label="Select toolkit" status="ready" output="verified release" acceptance="the shim accepts its digest" evidence=["src_shim", "src_trust_gate"] /%}
{% task id="ev_parse" label="Load source" status="ready" output="target records" acceptance="each source block parses" evidence=["src_load"] /%}
{% task id="ev_validate" label="Check document" status="ready" output="no error diagnostics" acceptance="visser check exits 0" evidence=["src_load"] /%}
{% task id="ev_render" label="Write snapshot" status="ready" output="HTML and Markdown" acceptance="visser build exits 0" evidence=["src_build"] /%}

{% dependency id="dp_select" from="ev_select" to="ev_render" label="toolkit must pass" /%}
{% dependency id="dp_parse" from="ev_parse" to="ev_validate" label="records must exist" /%}
{% dependency id="dp_valid" from="ev_validate" to="ev_render" label="source must pass" /%}
{% /graph %}

<!-- vs:id p_build_parse -->
The loader reads the primary file and declared files. It parses the source, checks frontmatter, and creates target records. {% cite ref="src_load" /%} The CLI stops before it writes output if validation reports an error. {% cite ref="src_build" /%}

<!-- vs:id p_build_identity -->
The source revision identifies declared source bytes after text line endings normalize. The build ID also covers the toolkit digest, extension digests, and render options. {% cite ref="src_revision" /%} The CLI uses both IDs in the snapshot path. {% cite ref="src_build" /%} A render-option-only change keeps a packet exact but changes the build ID. {% cite ref="src_stale" /%}

<!-- vs:id p_build_whose -->
The CLI uses a worker from its own selected release for layout. {% cite ref="src_workers" /%} The browser reads the finished snapshot. A later source change does not change that snapshot.

<!-- vs:id h_edit -->
## A packet permits one edit

<!-- vs:id p_edit_intro -->
A {% term ref="def_packet" %}reference packet{% /term %} binds an edit request to one {% term ref="def_target" %}target{% /term %}. It carries a document revision and a hash of the target body. Line numbers and headings do not make this decision.

<!-- vs:id g_edit -->
1. Issue a packet for one target.
2. Resolve the packet against the current source.
3. Replace only after an `exact` result.
4. Check and build the changed source.

<!-- vs:id p_edit_status -->
The resolver reports `exact` when the revision and body hash match. It reports `stale` when the source revision changed. The result says whether the target body changed too. {% cite ref="src_stale" /%} The replace command accepts only `exact`; the other results stop the write. {% cite ref="src_replace" /%}

<!-- vs:id p_edit_guard -->
The writer locks the document and creates a temporary candidate. It validates the candidate. It checks the original bytes again before it renames the candidate. {% cite ref="src_recheck" /%} A direct editor bypasses this guard.

<!-- vs:id h_next -->
## Read the source again

<!-- vs:id p_next -->
The figures name the main evidence. Open each cited excerpt before you rely on a behavioural claim. This page describes the current working tree, not a published release.

{% source id="src_load" kind="working-tree" title="The loader reads source and records targets" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/model/bundle.ts" start=59 end=101 capturedAt="2026-09-28T15:04:17Z" excerptSha256="5897aa8ca418fcb20a0d31bcd4b5d9b324e0d42b0b5cf199c804a16a2e26a75f" originFileSha256="fd23b564a79ad65fe4feca543574924a412c05e71c49f285c68347a5aaa2ebbf" %}
```typescript
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
  const docId = typeof parsed.frontmatter['docId'] === 'string' ? parsed.frontmatter['docId'] : undefined;

  // Declared content files. Every file must be a regular file inside the bundle (§15.4).
  const files: BundleFile[] = [{ path: 'index.md', kind: 'text', content: bytes }];
  const realRoot = realpathSync(root);
  for (const path of declaredPaths(parsed)) {
    const full = join(root, path);
    if (!existsSync(full)) {
      diagnostics.push({ code: 'E_REF_BROKEN', severity: 'error', message: `declared file ${path} does not exist`, path: 'index.md' });
      continue;
    }
    if (lstatSync(full).isSymbolicLink() || !statSync(full).isFile() || !realpathSync(full).startsWith(realRoot + sep)) {
      diagnostics.push({ code: 'E_PATH_ESCAPE', severity: 'error', message: `declared file ${path} is not a regular file inside the bundle`, path: 'index.md' });
      continue;
    }
    files.push({ path, kind: IMAGE_EXTENSIONS.test(path) ? 'binary' : 'text', content: new Uint8Array(readFileSync(full)) });
  }
  diagnostics.push(...validateDocument(parsed, model, new Map(files.filter((f) => f.kind === 'binary').map((f) => [f.path, f.content]))));
  const declared = new Set(files.map((f) => f.path));
  for (const extra of listBundleFiles(root)) {
    if (!declared.has(extra)) {
      diagnostics.push({ code: 'W_UNDECLARED_FILE', severity: 'warning', message: `${extra} is in the bundle folder but not declared; it is not read`, path: extra });
    }
  }

  let manifest: SourceManifest | undefined;
  let revision: string | undefined;
  if (docId && !diagnostics.some((d) => d.severity === 'error')) {
    try {
      const result = sourceRevision(docId, files);
```
{% /source %}

{% source id="src_workers" kind="working-tree" title="The build uses its own worker" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/cli/src/commands/build.ts" start=66 end=112 capturedAt="2026-09-28T15:04:29Z" excerptSha256="a1ec43444493475f4e35603156614915b801655457e2fe957f5279aa076adab6" originFileSha256="ee494e62b6ce5a57904bd216152d2de18cba9500a46286d007f5e86043c55f3e" %}
```typescript
  // SRI value for the lazily loaded Mermaid asset (§9.12).
  const integrity = existsSync(mermaidPath)
    ? { 'mermaid.js': `sha384-${createHash('sha384').update(readFileSync(mermaidPath)).digest('base64')}` }
    : undefined;
  // Workers come only from the running CLI's own release (§12.4 "Whose code
  // runs"); in source mode there is none, and layout runs in process.
  const workerPath = toolkit.workerRelease ? join(toolkit.workerRelease, 'workers', 'layout.cjs') : undefined;
  // Extensions (§14.3): pinned by the lock, verified, and run only if the user
  // trusts their exact digest. Resolution never executes anything.
  let extensions;
  try {
    const bound = bindExtensions(bundle.model, { bundleRoot: bundle.root, repoRoot: repoRootFor(bundle.root), allowFallback: request.extensionFallback === true });
    printDiagnostics(bound.diagnostics.filter((d) => d.severity === 'warning'), false);
    const errors = bound.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      printDiagnostics(errors, false);
      throw new CliError('E_BUILD', 'build stopped: an extension cannot run', exitCodeFor(errors));
    }
    extensions = bound.bindings;
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const d = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([d], false);
    throw new CliError('E_BUILD', 'build stopped: an extension cannot run', exitCodeFor([d]));
  }
  try {
    return await compileDocument(
      bundle,
      {
        version: toolkit.release.version,
        sha256: toolkit.release.sha256,
        assets: {
          'reader.js': assetSha('reader.js'),
          'reader.css': assetSha('reader.css'),
          ...(existsSync(mermaidPath) ? { 'mermaid.js': assetSha('mermaid.js') } : {}),
        },
        ...(integrity ? { integrity } : {}),
      },
      {
        audience: request.audience,
        includeSource: request.includeSource,
        layoutFallback: request.layoutFallback,
        ...(workerPath && existsSync(workerPath) ? { layout: workerLayout(workerPath) } : {}),
        nodeVersion: request.nodeVersion,
        ...(toolkit.development ? { development: true } : {}),
        extensions,
      },
```
{% /source %}

{% source id="src_stale" kind="working-tree" title="The resolver reports exact or stale" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/resolve.ts" start=148 end=187 capturedAt="2026-09-28T15:04:47Z" excerptSha256="5fc664efe7b38789190cbde83efe01cd93860f32deaf306602e6f809ffb99dca" originFileSha256="58d4f922fe307c0a0b149925e9f842bcc935b488db37718d7c90b36ea53f988a" %}
```typescript
      indexPath: located.path,
    };
  }

  // Steps 5–8.
  const bodyUnchanged = packet.bodySha256 === record.bodySha256;
  const advisory: Partial<ResolveResult> = {};
  if (packet.quote) {
    advisory.quoteFound = normalizeQuoteText(record.plainText, true).includes(normalizeQuoteText(packet.quote.exact, true));
  }
  if (packet.label !== undefined) advisory.labelMatches = packet.label === record.label;
  if (packet.kind !== undefined) advisory.kindMatches = packet.kind === record.kind;

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
        : 'the document changed since the packet was copied, including the target text', { targetId: record.id, suggestedAction: 'reconcile, then run `visser refs refresh`' })],
    };
  } else {
    result = {
      ...base,
      status: 'invalid',
      currentRevision,
      targetBodyUnchanged: false,
      ...advisory,
      diagnostics: [diag('E_REF_INVALID', 'the packet body digest is inconsistent with its claimed source revision', { targetId: record.id })],
    };
  }
  return { result, bundle, indexPath: located.path };
}
```
{% /source %}

{% source id="src_recheck" kind="working-tree" title="The writer validates, rechecks, and renames" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/guarded-write.ts" start=157 end=210 capturedAt="2026-09-28T15:16:12Z" excerptSha256="f5fef14367f52ebefdf2373c0934ef2fe3a10f6b74bb2c2c93a31ff4f07b9715" originFileSha256="93fbd094bb2155b2e574dbc0039d4b686a13de2e4988908956054be1d17c81cb" %}
```typescript

export type GuardedWriteOptions = {
  repoRoot: string;
  docId: string;
  indexPath: string;
  fsContext?: FsContext;
};

export type GuardedWriteResult = { after: LoadedBundle; original: Uint8Array; candidate: Uint8Array };

/**
 * Lock the document, let `produce` build the candidate under the lock, validate
 * the whole candidate document in memory, recheck the raw file, and rename.
 * Any error diagnostic in the candidate aborts the write with its code.
 */
export function guardedWrite(opts: GuardedWriteOptions, produce: () => GuardedCandidate): GuardedWriteResult {
  const { indexPath } = opts;
  if (lstatSync(indexPath).isSymbolicLink()) fail('E_PATH_ESCAPE', 'the primary file is a symbolic link');
  const lock = acquireLock(opts.repoRoot, opts.docId, opts.fsContext);
  let tempPath: string | undefined;
  try {
    const { original, candidate, validate } = produce();
    const rawHash = sha256Hex(original);

    tempPath = join(dirname(indexPath), `.${basename(indexPath)}.${lockToken(opts.fsContext)}.tmp`);
    const fd = openSync(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      writeSync(fd, candidate);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tempPath, statSync(indexPath).mode & 0o7777);

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
    tempPath = undefined;
    return { after, original, candidate };
  } finally {
    if (tempPath) rmSync(tempPath, { force: true });
    releaseLock(lock);
  }
}

```
{% /source %}

{% source id="src_trust_gate" kind="working-tree" title="The resolver checks repository trust" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/cli/src/toolkit.ts" start=178 end=211 capturedAt="2026-09-28T15:04:26Z" excerptSha256="3af29bbd09be2765a0095cc7750814179bdb02d8cd94376aac6831b87d529c7b" originFileSha256="3a262b5a072760770735f404169d7985a6ce3f56473f7e28acbcc2f42a4c1e1c" %}
```typescript
  // repository copy (install-pressure-1, m8).
  const userDir = join(visserHome(env), 'toolchains', digest);
  if (opts.repoRoot) {
    const dir = join(opts.repoRoot, '.visser', 'toolchains', digest);
    if (present(dir) && !(present(userDir) && !trusted(digest, env))) {
      if (!trusted(digest, env)) {
        throw new CliError('E_TOOLKIT_UNTRUSTED', `the repository toolchain ${dir} (${digest}) is not in the user trust store; review it, then run: visser trust toolkit ${digest}`, EXIT.security);
      }
      const release = verifyCandidate(dir, digest, 'repository toolchain');
      if (!isInside(realpathSync(dir), realpathSync(opts.repoRoot))) {
        throw new CliError('E_INTEGRITY', `repository toolchain ${dir} resolves outside the repository`, EXIT.security);
      }
      return { release, source: 'repository' };
    }
  }

  // 3. The user installation is trusted because the user installed it.
  if (present(userDir)) return { release: verifyCandidate(userDir, digest, 'user toolchain'), source: 'user' };

  // 4. The release that contains the running CLI (a development convenience).
  if (opts.ownRelease) {
    const release = verifyRelease(opts.ownRelease);
    if (release.sha256 === digest) return { release, source: 'running' };
  }

  throw new CliError('E_TOOLKIT_MISSING', `toolkit ${digest} is not installed; ${installHint(digest, opts.origin, opts.version)}`, EXIT.unavailable);
}

export type ToolkitSelection = {
  release: VerifiedRelease;
  development: boolean; // true when --dev-toolkit accepted a digest that differs from the lock
  warnings: string[];
  source: ResolutionSource | 'dev-toolkit';
  /** The release whose workers this CLI may run: its own, never another toolkit's (§12.4). */
```
{% /source %}

{% source id="src_shim" kind="working-tree" title="The user shim selects and starts a toolkit" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/cli/src/shim.ts" start=172 end=210 capturedAt="2026-09-28T15:04:21Z" excerptSha256="324e6a4d3960123ddbfd34fa2a5236580e0471f84ab855b971444b0684ebf93d" originFileSha256="104c903b6a706c3d52ed779bc6fd5b36d14cea8d7c4f0ce615273f91ff4fe8d1" %}
```typescript
    const digest = workspaceDefault(repoRoot) ?? readDefaultPointer(env);
    if (!digest) noDefault();
    return resolveDigest({ digest, repoRoot, env }).release;
  }
  // A user-level command. `install --from-dir DIR` needs no default at all:
  // the user named the release, so its own verified CLI installs it.
  const fromDir = command === 'install' ? stringFlag(args, 'from-dir') : undefined;
  let reason: string;
  try {
    const digest = readDefaultPointer(env);
    if (digest) return resolveDigest({ digest, env }).release;
    reason = `there is no default toolkit (${join(visserHome(env), 'default')})`;
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    reason = `the default toolkit is not usable: ${error.message.replace(/; (only a copy|install it with).*$/s, '')}`;
  }
  if (fromDir !== undefined) return verifyRelease(resolve(cwd, fromDir));
  throw recovery(reason, env);
}

const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/** Run the command through the selected toolkit's own CLI; resolves to its exit code. */
export function shimMain(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let release: VerifiedRelease;
  try {
    release = selectToolkit(argv, env);
  } catch (error) {
    let code: string;
    let message: string;
    let exit: number;
    if (error instanceof CliError) ({ code, message, exitCode: exit } = error);
    else if (error instanceof HashError) {
      ({ code, message } = error);
      exit = exitCodeFor([{ code, severity: 'error', message }]);
    } else throw error;
    printDiagnostics([{ code, severity: 'error', message }], argv.includes('--json'));
    return Promise.resolve(exit);
  }
```
{% /source %}

{% source id="src_revision" kind="working-tree" title="The source revision and build inputs" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/model/hash.ts" start=215 end=252 capturedAt="2026-09-28T15:06:41Z" excerptSha256="11d8adaf92ee0573d3e59fce6c0664c2fb42b204657e19f435d17a839bb1708c" originFileSha256="184a333e66f27504ab291c00e45de4ef66b764151e9c0cf71a094213010a527d" %}
```typescript
      throw new HashError('E_PATH_INVALID', 'E_PATH_CASE_COLLISION', `case collision for ${f.path}`);
    }
    seen.add(f.path);
    folded.add(fold);
    const sha256 = f.kind === 'text' ? normalizedTextSha256(f.content) : sha256Hex(f.content);
    return { path: f.path, sha256 };
  });
  if (!seen.has('index.md')) throw new HashError('E_PATH_INVALID', 'E_MANIFEST', 'index.md is required');
  entries.sort((a, b) => compareCodePoints(a.path, b.path));
  return { schema: 'visser-source-manifest/1', docId, files: entries };
}

/** §17.9 computeSourceRevision: sha256 of the canonical manifest. */
export function computeSourceRevision(manifest: SourceManifest): Sha256 {
  return canonicalSha256(manifest);
}

export function sourceRevision(docId: string, files: readonly BundleFile[]) {
  const manifest = sourceManifest(docId, files);
  const canonical = canonicalJSON(manifest);
  return { manifest, canonical, sourceRevision: sha256Hex(Buffer.from(canonical, 'utf8')) };
}

// ---------------------------------------------------------------------------
// Build ID

export type EffectiveRenderOptions = {
  audience: 'private' | 'public';
  includeSource: boolean;
  layoutFallback: boolean;
  /**
   * Present, and true, only for a development build (§12.4). A development build
   * and a normal build of the same source and toolkit then get different IDs, so
   * an existing snapshot folder is never replaced. Absent otherwise, so normal
   * build IDs do not change.
   */
  development?: true;
};
```
{% /source %}

{% source id="src_build" kind="working-tree" title="The CLI stops errors before output" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/cli/src/commands/build.ts" start=138 end=170 capturedAt="2026-09-28T15:07:40Z" excerptSha256="6c425c2db1026f2b037a1946874f9734d0a65470aa65a94e946b8aa9d11325cc" originFileSha256="ee494e62b6ce5a57904bd216152d2de18cba9500a46286d007f5e86043c55f3e" %}
```typescript
  if (code !== EXIT.ok) {
    printDiagnostics(bundle.diagnostics.filter((d) => d.severity === 'error'), false);
    throw new CliError('E_BUILD', 'build stopped: the source has errors', code);
  }

  const toolkit = resolveForDocument(bundle.root, stringFlag(args, 'toolkit-dir'), stringFlag(args, 'dev-toolkit'));
  for (const warning of toolkit.warnings) process.stderr.write(`warning ${warning}\n`);

  const releaseDir = toolkit.release.dir;
  const mermaidPath = join(releaseDir, 'browser', 'mermaid.js');
  const result = await compileWithToolkit(bundle, toolkit, {
    audience: 'private',
    includeSource: false,
    layoutFallback: args.flags.has('allow-layout-fallback'),
    nodeVersion: process.version,
    extensionFallback: args.flags.has('allow-extension-fallback'),
  });
  printDiagnostics(result.diagnostics.filter((d) => d.severity === 'warning'), false);

  // Find the repository before anything is written: the first build outside a
  // repository creates DOC/.visser, which would then look like a repository.
  const repository = findRepoRoot(bundle.root);
  const outDir = resolve(stringFlag(args, 'out') ?? join(repository ?? bundle.root, '.visser', 'output'));
  const snapshotDir = `d/${result.docId}/${result.sourceRevision}/${result.buildId}`;
  const finalDir = join(outDir, snapshotDir);

  // Shared asset pack (§13.1): each needed file is copied on its own, so a later
  // Mermaid build adds mermaid.js to an asset directory that already exists.
  const assetDir = join(outDir, '_visser', 'assets', toolkit.release.sha256);
  const needed = ['reader.js', 'reader.css', ...(result.needsMermaid ? ['mermaid.js'] : [])];
  if (result.needsMermaid && !existsSync(mermaidPath)) {
    throw new CliError('E_TOOLKIT_MISSING', `the toolkit at ${releaseDir} has no browser/mermaid.js; this document needs a toolkit with Mermaid support`, EXIT.unavailable);
  }
```
{% /source %}

{% source id="src_replace" kind="working-tree" title="The replace command requires exact" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/replace.ts" start=120 end=138 capturedAt="2026-09-28T15:16:15Z" excerptSha256="75522c04ea050601e310dc63c3a9b11e2806da55da9de057d5991a0001fc6685" originFileSha256="0e092484068fc99e5d5b677d6eb0d01507e799a8ca015f7f3a98a6b224d2393b" %}
```typescript
  const indexPath = located.path;

  let before: LoadedBundle | undefined;
  let region = { start: 0, end: 0 };
  const { after, original, candidate } = guardedWrite({ repoRoot: opts.repoRoot, docId: packet.docId, indexPath, ...(opts.fsContext ? { fsContext: opts.fsContext } : {}) }, () => {
    // Step 2: reparse under the lock and require exact resolution.
    const { result, bundle } = resolveReference(packet, { repoRoot: opts.repoRoot, doc: indexPath });
    if (result.status === 'stale') fail('E_REF_STALE', 'the packet is stale; resolve, reconcile, and refresh it before replacing');
    if (result.status !== 'exact' || !bundle) {
      const first = result.diagnostics[0];
      fail(first?.code ?? 'E_REF_INVALID', `the packet does not resolve exactly (${result.status}): ${first?.message ?? ''}`);
    }
    if (bundle.sourceRevision !== expectedRevision) {
      fail('E_REF_STALE', `--expected-revision ${expectedRevision} is not the current revision ${bundle.sourceRevision}`);
    }
    const record = bundle.model.targets.get(packet.targetId)!;
    if (record.kind === 'source') fail('E_REF_INVALID', 'captured evidence cannot be replaced; recapture it instead');
    if (record.kind.startsWith('mermaid-')) {
      fail('E_REF_INVALID', `${packet.targetId} is inside Mermaid figure ${record.parentId ?? ''}; edit the figure (replace ${record.parentId ?? 'the figure'} as a whole)`);
```
{% /source %}
