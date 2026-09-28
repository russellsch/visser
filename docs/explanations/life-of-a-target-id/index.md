---
format: visser/1
docId: 73df59fe-396f-4f7e-b1a2-76c1e3309c6c
title: "The life of a target ID"
kind: teaching
capturedAt: 2026-09-27T23:57:03Z
visibility: private
---

<!-- vs:id overview -->
# The life of a target ID

<!-- vs:id p_intro -->
When you let an agent edit a document, you need a way to say "change this paragraph" that still means the same paragraph after other people have edited the file. Visser gives every addressable block a target ID that lives in the source text. An agent receives a reference packet that names the document and the target, and Visser refuses the edit if the packet no longer describes what is in the file. This page follows one ID from the moment it is created to the moment it is retired, and it shows what breaks it.

{% definition id="def_target" term="target" %}
A target is one addressable part of a document: a heading, a paragraph, a list, a table, a code block, or a part of a figure. Each target has an ID that is unique in its document.
{% /definition %}

{% definition id="def_packet" term="reference packet" %}
A reference packet is a small YAML record that names one target by document ID and target ID, and records the source revision and the body hash that the reader saw.
{% /definition %}

<!-- vs:id h_birth -->
## Where an ID comes from

<!-- vs:id p_markers -->
A top-level block gets its ID from a marker line directly above it, such as `<!-- vs:id p_capacity -->`. A block tag, such as a `detail` or a figure part, takes its ID from its `id` attribute instead. You can choose a readable ID, or run `visser ids assign`. That command gives a new ID only to each block without a marker. The new ID is `b_` followed by 16 base32 characters from 10 random bytes, and it is never an ID that the document already uses. {% cite ref="src_assign" /%}

<!-- vs:id p_span -->
The {% term ref="def_target" %}target{% /term %} of a marker starts at the marker line and ends at the last line of its block. {% cite ref="src_span" /%} The marker therefore travels with the block: if you cut a paragraph and paste it elsewhere with its marker, it keeps its ID. If you paste it without the marker, it becomes a new block with no ID, and `check` reports `E_ID_MISSING`.

<!-- vs:id h_packet -->
## What a packet records

<!-- vs:id p_packet_intro -->
A {% term ref="def_packet" %}reference packet{% /term %} does not store the text of the target. It stores two hashes, and each one answers a different question later: "did anything in the document change?" and "did this target's own text change?"

{% transform id="tf_packet" title="From source bytes to a reference packet" question="Which parts of the file end up in a packet, and what is lost on the way?" %}
Each box is one representation of the same target. Only IDs and hashes reach the packet; the text stays in the file.

{% stage id="sg_bytes" label="Bundle files" representation="UTF-8 bytes of index.md and each declared file" location="document folder" /%}

{% stage id="sg_span" label="Target span" representation="byte range from the marker line to the end of the block" location="index.md" /%}

{% stage id="sg_body" label="Body hash" representation="bodySha256: sha256 of the normalized span text" /%}

{% stage id="sg_rev" label="Source revision" representation="sha256 of the canonical manifest of all declared files" /%}

{% stage id="sg_ref" label="Reference packet" representation="YAML: docId, targetId, sourceRevision, bodySha256, label, optional quote" location="agent or clipboard" /%}

{% conversion id="cv_parse" from="sg_bytes" to="sg_span" label="parse; bind each marker to the next block" /%}

{% conversion id="cv_hash_body" from="sg_span" to="sg_body" label="decode, drop one BOM, CRLF and CR to LF, hash" loss="the text itself; line-ending style" /%}

{% conversion id="cv_manifest" from="sg_bytes" to="sg_rev" label="hash each file, sort paths, hash the manifest" loss="the text itself" /%}

{% conversion id="cv_issue_body" from="sg_body" to="sg_ref" label="copy into the packet" /%}

{% conversion id="cv_issue_rev" from="sg_rev" to="sg_ref" label="copy into the packet" /%}
{% /transform %}

<!-- vs:id p_hashes -->
The body hash is the sha256 of the span text after strict UTF-8 decoding, removal of one leading byte-order mark, and conversion of CRLF and CR to LF. A change of line endings alone therefore does not change it. {% cite ref="src_body_hash" /%} The source revision is the sha256 of a canonical manifest that lists the document ID and every declared file with its hash, sorted by path. Text files are hashed after the same normalization, so a change of line endings alone changes neither hash, and a packet stays `exact`. Any other change to a declared file changes the revision. {% cite ref="src_revision" /%}

<!-- vs:id p_lookup -->
A packet names its document by `docId`, not by path. The resolver searches the configured document roots for the one primary file with that `docId`. {% cite ref="src_locate" /%} You can move or rename a document folder inside the document roots, and its packets still find it. If two files carry the same `docId`, the result is `ambiguous`, and nothing is edited.

<!-- vs:id h_aging -->
## How a packet ages

<!-- vs:id p_aging_intro -->
A packet is a snapshot of what the reader saw. The document keeps changing, so the same packet gives a different answer over time. The figure shows the answers that a held packet can give, and the commands that move an agent to a fresh packet.

{% graph id="lifecycle" mode="state" title="What a held packet resolves to as the document changes" question="Which edits make a packet stale, which make it unusable, and what brings an agent back to an exact packet?" %}
The states are resolver answers for one packet. A refresh issues a new packet; the old one stays as it was.

{% state id="st_exact" label="exact" initial=true %}
Same source revision and same body hash. `refs replace` accepts it.
{% /state %}

{% state id="st_stale_same" label="stale, text unchanged" %}
The document changed, but this target's text did not.
{% /state %}

{% state id="st_stale_changed" label="stale, text changed" %}
The target's own text changed since the packet was copied.
{% /state %}

{% state id="st_missing" label="missing" %}
No live target and no retirement record, or the document has an error.
{% /state %}

{% state id="st_deleted" label="deleted" terminal=true %}
The ID is in `retiredTargets`, with a reason and an optional replacement.
{% /state %}

{% transition id="tr_other_edit" from="st_exact" to="st_stale_same" event="another block changes" label="another block changes" /%}

{% transition id="tr_own_edit" from="st_exact" to="st_stale_changed" event="the target's text changes" label="the target's text changes" /%}

{% transition id="tr_own_edit_later" from="st_stale_same" to="st_stale_changed" event="the target's text changes" label="the target's text changes" /%}

{% transition id="tr_refresh" from="st_stale_same" to="st_exact" event="refs refresh --acknowledge-stale" label="refs refresh --acknowledge-stale" action="issue a new packet" /%}

{% transition id="tr_refresh_body" from="st_stale_changed" to="st_exact" event="refs refresh, both acknowledgements" label="refs refresh with both acknowledgements" guard="the instruction still applies to the new text" action="issue a new packet" /%}

{% transition id="tr_retire" from="st_exact" to="st_deleted" event="refs retire" label="refs retire" action="remove the span; record the reason" /%}

{% transition id="tr_hand_delete" from="st_exact" to="st_missing" event="block removed by hand, or an error anywhere" label="block removed by hand, or any error" /%}

{% transition id="tr_fixed" from="st_missing" to="st_stale_same" event="the error is fixed (usually stale)" label="the error is fixed (usually stale)" /%}
{% /graph %}

<!-- vs:id p_stale -->
The resolver compares the packet with the current file in a fixed order. An absent ID is `deleted` if the frontmatter has a retirement record for it, and `missing` if it does not. A present ID is `exact` only if both the source revision and the body hash match. It is `stale` if the source revision differs, and the result says whether the body hash still matches. A packet whose revision matches but whose body hash does not is `invalid`, because no real file can produce that pair. {% cite ref="src_resolve_status" /%}

<!-- vs:id p_refresh -->
A stale packet is not an error to hide. `refs refresh` issues a new packet only when you pass the current revision and `--acknowledge-stale`. If the target's own text changed, it also needs `--acknowledge-body-change`, and the skill tells an agent to show you the new text before it passes that flag. {% cite ref="src_refresh" /%}

<!-- vs:id p_missing_caveat -->
One answer surprises people: while the document has any error, every packet resolves `missing`, even a packet for a target that is intact. The resolver does not guess target positions in a file that it cannot parse completely. {% cite ref="src_resolve_errors" /%} Fix the error first, and the packets come back. They are usually `stale`, because the file is rarely byte-for-byte the same as when the packet was copied.

<!-- vs:id h_why_ids -->
## Why not headings or line numbers

{% compare id="cmp_handles" title="Four ways to point at a paragraph" question="Which way of naming a target still names the same target after ordinary edits?" %}
Only the target ID is stored in the source and is unique by rule.

{% option id="o_id" label="Target ID" /%}
{% option id="o_heading" label="Heading text" /%}
{% option id="o_line" label="Line number" /%}
{% option id="o_quote" label="Quoted text" /%}

{% criterion id="c_reword" label="The target is reworded" /%}
{% criterion id="c_elsewhere" label="Text above the target changes" /%}
{% criterion id="c_move" label="The target moves in the file" /%}
{% criterion id="c_unique" label="Two targets have the same text" /%}

{% cell id="x_id_reword" option="o_id" criterion="c_reword" %}
Still found. The packet resolves stale with changed text, so the agent sees the new wording first.
{% /cell %}

{% cell id="x_id_elsewhere" option="o_id" criterion="c_elsewhere" %}
Still found; stale with unchanged text.
{% /cell %}

{% cell id="x_id_move" option="o_id" criterion="c_move" %}
Still found, if the marker moved with the block.
{% /cell %}

{% cell id="x_id_unique" option="o_id" criterion="c_unique" %}
Still distinct: IDs are unique in the document by rule.
{% /cell %}

{% cell id="x_heading_reword" option="o_heading" criterion="c_reword" %}
Lost when the heading is renamed.
{% /cell %}

{% cell id="x_heading_unique" option="o_heading" criterion="c_unique" %}
Two sections called "Limits" are indistinguishable.
{% /cell %}

{% cell id="x_line_elsewhere" option="o_line" criterion="c_elsewhere" %}
Points at a different block after one inserted line.
{% /cell %}

{% cell id="x_line_move" option="o_line" criterion="c_move" %}
Points at whatever now occupies the old line.
{% /cell %}

{% cell id="x_heading_elsewhere" option="o_heading" criterion="c_elsewhere" %}
Still found, unless a new section with the same heading appears above it.
{% /cell %}

{% cell id="x_heading_move" option="o_heading" criterion="c_move" %}
Names the section, not the paragraph, so a paragraph moved to another section is lost.
{% /cell %}

{% cell id="x_line_reword" option="o_line" criterion="c_reword" %}
Still points at the block while the rewording keeps the same number of lines.
{% /cell %}

{% cell id="x_line_unique" option="o_line" criterion="c_unique" %}
Still distinct, by position.
{% /cell %}

{% cell id="x_quote_elsewhere" option="o_quote" criterion="c_elsewhere" %}
Still found.
{% /cell %}

{% cell id="x_quote_move" option="o_quote" criterion="c_move" %}
Still found.
{% /cell %}

{% cell id="x_quote_reword" option="o_quote" criterion="c_reword" %}
Lost as soon as one word changes.
{% /cell %}

{% cell id="x_quote_unique" option="o_quote" criterion="c_unique" %}
Matches both copies.
{% /cell %}
{% /compare %}

<!-- vs:id p_quote_role -->
A packet may still carry a quote and a label. They are hints for a human or an agent to confirm that the right text was meant. The resolver reports whether they match, but it never chooses a target by them. {% cite ref="src_resolve_status" /%}

<!-- vs:id h_change -->
## Changing and removing a target

<!-- vs:id p_replace -->
`refs replace` rewrites one target in a guarded write. Under the edit lock it resolves the packet again, and it refuses a packet that is not `exact` or a `--expected-revision` that is not current. {% cite ref="src_replace_guard" /%} The replacement must keep the target's own ID, and every nested ID of the old target must appear in the replacement exactly once. A replacement may add new blocks next to the kept one, which is how a paragraph splits, but a new block must not reuse an ID that exists elsewhere in the document. {% cite ref="src_retention" /%} To drop a nested target on purpose, the same command takes `--retire ID --reason TEXT`.

<!-- vs:id p_retire -->
`refs retire` removes a target and writes its ID, a reason, and an optional replacement into `retiredTargets` in the frontmatter. It refuses while a live target still refers to the retired ID, it refuses a replacement that is itself being removed, and it refuses a chain of replacements. {% cite ref="src_retire" /%} A merge is a retirement with a replacement: first replace the paragraph you keep with the merged text, then retire the other one and name the kept one as its replacement. Old packets for the retired paragraph then resolve `deleted` and point to the kept one.

<!-- vs:id h_breaks -->
## What breaks an ID

<!-- vs:id l_breaks -->
- **Copying a document folder with `cp`.** Both copies keep the same `docId`, so every packet for them becomes `ambiguous`. Use `visser fork`, which gives the copy a new `docId`. {% cite ref="src_locate" /%} {% cite ref="src_fork" /%}
- **Deleting a block by hand.** The ID disappears with no retirement record, so old packets say `missing` instead of `deleted`, and nobody learns why. {% cite ref="src_resolve_status" /%}
- **Renaming an ID.** To the resolver, a renamed ID is an old ID with no retirement record plus a new one, so old packets resolve `missing`. Keep the ID when the text changes; change it only when the meaning changes.
- **Pasting a block without its marker.** The block gets no ID, or a new one from `ids assign`, and old packets for the original are `missing`.
- **Leaving an error in the file.** Every packet resolves `missing` until the error is fixed. {% cite ref="src_resolve_errors" /%}

<!-- vs:id p_limits -->
These rules protect the identity of a target, not the truth of its text. A packet that resolves `exact` tells an agent that it is editing the text you saw. It does not tell anyone that the text is correct, and a stale packet with unchanged text can still sit next to paragraphs that changed its meaning.

{% source id="src_assign" kind="git" title="ids assign: a random ID for each block without a marker" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/syntax/ids.ts" start=48 end=67 capturedAt="2026-09-27T23:57:25Z" excerptSha256="8b89665cce577b594b3d0ccd97625f7fa33db6ef73193c84774b6a085fe07f3e" originFileSha256="8195ddacd7de8038a374062a56142543d705bc36240bcf003e46953d3bbfb376" %}
```typescript
  const src = a.text;
  const nl = detectNewline(bytes);
  const used = new Set(a.source.targets.map((t) => t.id));
  const newId = () => {
    for (;;) {
      const id = `b_${base32(randomBytes(10))}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };

  const enc = new TextEncoder();
  const inserts = a.unmarked.map((u) => {
    const id = newId();
    const prev = u.line - 1;
    const prevOk = u.line === 0 || isBlank(src.lines[prev]) || prev === a.frontmatterCloseLine;
    const text = `${prevOk ? '' : nl}<!-- vs:id ${id} -->${nl}`;
    return { offset: src.lineStart[u.line] ?? bytes.length, id, bytes: enc.encode(text) };
```
{% /source %}

{% source id="src_span" kind="git" title="A marker target's span starts at its marker line" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/syntax/parse.ts" start=183 end=190 capturedAt="2026-09-27T23:57:39Z" excerptSha256="43ee28ec8df709bd40c1a54202981be497ee24fea8d0dc266521d88493777483" originFileSha256="0a2e86b9f0bc5b08ebccf3093dfe15e453a5c66ac0dfbe944af952132f514e7a" %}
```typescript
  function markerTarget(id: string, markerLine: number, block: MNode, s: SourceText, rep: typeof report): ParsedTarget | undefined {
    const blockEnd = trimTrailingBlank(s, block.lines[block.lines.length - 1] ?? markerLine + 1);
    return provenTarget(s, rep, {
      id, kind: blockKind(block), origin: 'marker', attributes: {},
      startLine: markerLine, endLineExclusive: blockEnd,
      firstLine: (first) => first === (s.lines[markerLine] ?? ''),
      lastLine: (last) => !isBlank(last),
    });
```
{% /source %}

{% source id="src_body_hash" kind="git" title="bodySha256: normalized text of the span" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/model/hash.ts" start=36 end=57 capturedAt="2026-09-28T00:03:31Z" excerptSha256="69bcd458f56781723036e6875b2fee518bc3a657811f54d3e3ee8aaecbad9ad9" originFileSha256="184a333e66f27504ab291c00e45de4ef66b764151e9c0cf71a094213010a527d" %}
```typescript

/** Decode strict UTF-8, remove one leading BOM, and convert CRLF and CR to LF. */
export function normalizeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new HashError('E_SYNTAX', 'E_UTF8', 'invalid UTF-8');
  }
  if (text.startsWith('\ufeff')) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** sha256 of the normalized text of a target span (§7.4 bodySha256). */
export function bodySha256(spanBytes: Uint8Array): Sha256 {
  return sha256Hex(Buffer.from(normalizeText(spanBytes), 'utf8'));
}

/** sha256 of normalized text, as used for captured excerpts and text bundle files. */
export function normalizedTextSha256(bytes: Uint8Array): Sha256 {
  return bodySha256(bytes);
}
```
{% /source %}

{% source id="src_revision" kind="git" title="sourceRevision: hash of the canonical manifest" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/model/hash.ts" start=203 end=236 capturedAt="2026-09-27T23:58:07Z" excerptSha256="f52f79f3ac3a379c3ace6296ddb7e8bcc762c1412d60ee99880bcccaa352d0e2" originFileSha256="184a333e66f27504ab291c00e45de4ef66b764151e9c0cf71a094213010a527d" %}
```typescript
/** Build the source manifest (§7.4) from declared bundle files. */
export function sourceManifest(docId: string, files: readonly BundleFile[]): SourceManifest {
  assertDocId(docId);
  const seen = new Set<string>();
  const folded = new Set<string>();
  const entries = files.map((f) => {
    validateBundlePath(f.path);
    if (seen.has(f.path)) {
      throw new HashError('E_PATH_INVALID', 'E_PATH_DUPLICATE', `duplicate path ${f.path}`);
    }
    const fold = f.path.normalize('NFC').toLowerCase().normalize('NFC');
    if (folded.has(fold)) {
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
```
{% /source %}

{% source id="src_locate" kind="git" title="Find a document by docId in the document roots" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/registry.ts" start=118 end=126 capturedAt="2026-09-27T23:57:26Z" excerptSha256="3528b9665883a99a94ccde835557e48bfc82fe5ad18b04a39b7ca9792fed88b9" originFileSha256="dcc27e049e195f43aa934ae9637b045b5b945e0ec47c510294219027d9af406c" %}
```typescript
  const matches: string[] = [];
  for (const root of documentRoots(opts.repoRoot)) {
    for (const file of primaryFiles(root)) {
      if (frontmatterDocId(file) === docId) matches.push(file);
    }
  }
  if (matches.length === 0) return { status: 'missing', message: `no document with docId ${docId} in the configured roots` };
  if (matches.length > 1) return { status: 'ambiguous', paths: matches.sort() };
  return { status: 'found', path: matches[0]! };
```
{% /source %}

{% source id="src_resolve_status" kind="git" title="Resolver: deleted, missing, exact, stale, invalid" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/resolve.ts" start=134 end=185 capturedAt="2026-09-27T23:57:27Z" excerptSha256="25dc4ec4fdbebe7945a0397e7c95f4494f755106c92e197b9e817287cc791a5d" originFileSha256="58d4f922fe307c0a0b149925e9f842bcc935b488db37718d7c90b36ea53f988a" %}
```typescript
  // Step 9: absent target.
  if (!record) {
    const retired = retiredTargets(bundle)[packet.targetId];
    if (retired) {
      const replacement = retired.replacement ? ` Advisory replacement: ${retired.replacement}.` : '';
      return {
        result: { ...base, status: 'deleted', currentRevision, diagnostics: [diag('E_REF_BROKEN', `target ${packet.targetId} was retired: ${retired.reason ?? 'no reason given'}.${replacement}`, { targetId: packet.targetId })] },
        bundle,
        indexPath: located.path,
      };
    }
    return {
      result: { ...base, status: 'missing', currentRevision, diagnostics: [diag('E_REF_BROKEN', `target ${packet.targetId} is not in the current document and has no retirement record`, { targetId: packet.targetId })] },
      bundle,
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
```
{% /source %}

{% source id="src_refresh" kind="git" title="refs refresh: the two acknowledgements" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/refresh.ts" start=42 end=53 capturedAt="2026-09-27T23:57:27Z" excerptSha256="bdf70bf0b8209f7686016b7b45d5b3812130e247f7d2f1641a67b144db4ca16e" originFileSha256="10780266415ecc9e8dc66f5540512ef5220c439ef8002700be19b00ee1851e57" %}
```typescript
  if (result.currentRevision !== expectedCurrent) {
    throw new RefreshRefused(`--expected-current does not match the current revision ${result.currentRevision}`, result, current.sourceText);
  }
  if (result.status === 'stale' && !acknowledgements.stale) {
    throw new RefreshRefused('the packet is stale; pass --acknowledge-stale to reissue it', result, current.sourceText);
  }
  const bodyUnchanged = result.targetBodyUnchanged === true;
  if (!bodyUnchanged && !acknowledgements.bodyChange) {
    throw new RefreshRefused(
      'the target text changed since the packet was copied; show the current text to the user, then pass --acknowledge-body-change only if the instruction still clearly applies',
      result,
      current.sourceText,
```
{% /source %}

{% source id="src_resolve_errors" kind="git" title="Resolver: a document with errors resolves nothing" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/resolve.ts" start=116 end=129 capturedAt="2026-09-27T23:57:27Z" excerptSha256="9b7836828434ba54b1a8fd4257153e4ee43ee3c80542e1d947ed57d3c51026c9" originFileSha256="58d4f922fe307c0a0b149925e9f842bcc935b488db37718d7c90b36ea53f988a" %}
```typescript
  // Step 3: parse and validate current source; never use cached offsets.
  const bundle = loadBundle(located.path);
  const errors = bundle.diagnostics.filter((d) => d.severity === 'error');
  const duplicate = errors.find((d) => d.code === 'E_ID_DUPLICATE' && d.targetId === packet.targetId);
  if (duplicate) {
    return { result: { ...base, status: 'ambiguous', diagnostics: errors }, bundle, indexPath: located.path };
  }
  if (errors.length > 0 || bundle.sourceRevision === undefined) {
    return {
      result: { ...base, status: 'missing', diagnostics: [diag('E_REF_BROKEN', 'the current source has errors, so the target cannot be located reliably'), ...errors] },
      bundle,
      indexPath: located.path,
    };
  }
```
{% /source %}

{% source id="src_replace_guard" kind="git" title="refs replace refuses a stale packet or revision" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/replace.ts" start=116 end=134 capturedAt="2026-09-28T00:03:31Z" excerptSha256="7bb2e3d68933140c46838422f0d1ca858a610ee2471d95df4d3a162291a37be2" originFileSha256="0e092484068fc99e5d5b677d6eb0d01507e799a8ca015f7f3a98a6b224d2393b" %}
```typescript
export function replaceTarget(packet: ReferencePacket, replacement: Uint8Array, expectedRevision: string, opts: ReplaceOptions): EditResult {
  const located = locateDocument(packet.docId, opts.doc === undefined ? { repoRoot: opts.repoRoot } : { repoRoot: opts.repoRoot, doc: opts.doc });
  if (located.status === 'ambiguous') fail('E_DOC_DUPLICATE', `docId ${packet.docId} appears in ${located.paths.length} primary files`);
  if (located.status === 'missing') fail('E_REF_BROKEN', located.message);
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
```
{% /source %}

{% source id="src_retention" kind="git" title="refs replace: ID retention rules" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/replace.ts" start=90 end=110 capturedAt="2026-09-27T23:57:28Z" excerptSha256="95e613180d20948e29262a14716911410e5edc0c97f6753845ab575ee3bb5df0" originFileSha256="0e092484068fc99e5d5b677d6eb0d01507e799a8ca015f7f3a98a6b224d2393b" %}
```typescript
  const inRegion = (t: TargetRecord) => t.span.startByte >= region.start && t.span.endByte <= region.end;
  const retained = after.model.targets.get(targetId);
  if (!retained || !inRegion(retained)) fail('E_ID_RETENTION', `the replacement must keep the target ID ${targetId}`);
  // Every nested ID of the old target must remain inside the replacement exactly once.
  for (const id of descendants(before.model.targets, targetId)) {
    const kept = after.model.targets.get(id);
    if (retiring.has(id)) {
      if (kept) fail('E_SEMANTIC', `--retire ${id}: the replacement still contains ${id}`);
      continue;
    }
    if (!kept || !inRegion(kept)) {
      fail('E_ID_RETENTION', `the replacement drops nested target ${id}; add \`--retire ${id} --reason TEXT\` to retire it in the same write`);
    }
  }
  // Roots in the region other than the retained one are new siblings (a split) and must be new IDs.
  const regionRoots = [...after.model.targets.values()].filter((t) => inRegion(t) && (!t.parentId || !inRegion(after.model.targets.get(t.parentId)!)));
  for (const root of regionRoots) {
    if (root.id !== targetId && before.model.targets.has(root.id) && !descendants(before.model.targets, targetId).includes(root.id)) {
      fail('E_ID_RETENTION', `the replacement reuses existing target ID ${root.id}`);
    }
  }
```
{% /source %}

{% source id="src_retire" kind="git" title="refs retire: replacement and referrer checks" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/retire.ts" start=99 end=110 capturedAt="2026-09-27T23:57:28Z" excerptSha256="fee9a3eda04cf85cef52cad36a61b9db11e04bc35132f44478f54a2c145b419d" originFileSha256="c278da22b0d8a01b7659eb46ad9b183a21a010869f7eca22f820c02190ba0e9d" %}
```typescript
    const removedSet = new Set(removed);

    if (request.replacement !== undefined) {
      if (removedSet.has(request.replacement)) fail('E_SEMANTIC', `--replacement ${request.replacement} is inside the retired span`);
      if (!bundle.model.targets.has(request.replacement)) fail('E_REF_BROKEN', `--replacement ${request.replacement} is not a live target`);
    }
    const referrers = referrersOf(bundle, removedSet);
    if (referrers.length > 0) fail('E_REF_BROKEN', `live targets still refer to retired IDs: ${referrers.join(', ')}; change them first`);
    const chained = Object.entries(retiredMap(bundle)).filter(([, entry]) => entry.replacement !== undefined && removedSet.has(entry.replacement));
    if (chained.length > 0) {
      fail('E_SEMANTIC', `retired targets name a removed ID as their replacement (${chained.map(([id, e]) => `${id} -> ${e.replacement}`).join(', ')}); a replacement chain is not allowed`);
    }
```
{% /source %}

{% source id="src_fork" kind="git" title="fork: the copy gets a new random docId" language="typescript" repository="https://github.com/russellsch/visser.git" commit="0f6959a44a7c57808b318f279f3a09c26e99036a" file="packages/core/src/references/fork.ts" start=86 end=101 capturedAt="2026-09-27T23:59:29Z" excerptSha256="157d06dde9b7078062682c9d1ddfdb472fb6f81b57e39a97712fd911db65315e" originFileSha256="70ff3c6ccc9a0053ebf1c4838a29e55af91ba8f87b16cf5eb932a31543f1cf54" %}
```typescript

  const docId = opts.newDocId ?? randomUUID();
  const staging = join(realParent, `.${basename(target)}.${lockToken(opts.fsContext)}.fork`);
  mkdirSync(staging, { mode: 0o755 });
  try {
    for (const rel of copies) {
      const from = join(sourceRoot, ...rel.split('/'));
      regularFile(from, rel);
      if (!isInside(realpathSync(from), realSource)) fail('E_PATH_ESCAPE', `${rel} resolves outside the source bundle`);
      const to = join(staging, ...rel.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      let bytes: Uint8Array = new Uint8Array(readFileSync(from));
      if (rel === 'index.md') {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        bytes = new TextEncoder().encode(rewriteDocId(text, docId));
      }
```
{% /source %}

