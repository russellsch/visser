---
format: visser/1
docId: 73df59fe-396f-4f7e-b1a2-76c1e3309c6c
title: "The life of a target ID"
kind: teaching
capturedAt: 2026-09-27T23:57:03Z
reader:
  profile: experienced-systems-engineer
  knows: [YAML, UTF-8, SHA-256, CR, CRLF, LF]
  new: [target, reference packet, body hash, source revision]
  mustUnderstand:
    - "Explain why a target ID still identifies a block after it moves."
    - "Predict whether another block's edit makes a held packet stale with unchanged text."
    - "Name the two acknowledgements required to refresh a packet after its target text changes."
    - "Choose refs retire instead of a hand deletion when a target must disappear."
visibility: private
---

<!-- vs:id overview -->
# The life of a target ID

<!-- vs:id p_intro -->
An agent needs a stable name for the text that it edits. Visser keeps that name with the block in the source. The agent must stop when its packet no longer describes the file.

{% definition id="def_target" term="target" %}
A target is one addressable block or figure part with a stable ID. Each ID is unique in one document.
{% /definition %}

{% definition id="def_document" term="document" %}
A document is a source bundle that holds targets.
{% /definition %}

{% definition id="def_packet" term="reference packet" %}
A reference packet is a YAML record for one target at one source revision. It holds the document ID, target ID, and two hashes.
{% /definition %}

{% definition id="def_body_hash" term="body hash" %}
A body hash identifies normalized text of one target span.
{% /definition %}

{% definition id="def_source_revision" term="source revision" %}
A source revision identifies the declared files of one document.
{% /definition %}

{% domain id="id_map" title="The names around one edit" question="Which names identify the document, the block, and the packet that carries both?" %}
The map gives each name one job before the later figures use it.

{% concept id="c_document" label="Document" definition="def_document" category="thing" /%}
{% concept id="c_target" label="Target" definition="def_target" category="thing" /%}
{% concept id="c_packet" label="Reference packet" definition="def_packet" category="value" /%}
{% concept id="c_body" label="Body hash" definition="def_body_hash" category="value" /%}
{% concept id="c_revision" label="Source revision" definition="def_source_revision" category="value" /%}
{% relation id="r_contains" from="c_document" to="c_target" kind="has" label="has" /%}
{% relation id="r_names" from="c_packet" to="c_target" kind="identifies" label="names" /%}
{% relation id="r_body" from="c_packet" to="c_body" kind="uses" label="carries" /%}
{% relation id="r_revision" from="c_packet" to="c_revision" kind="uses" label="carries" /%}
{% /domain %}

<!-- vs:id h_birth -->
## An ID travels

<!-- vs:id p_markers -->
A marker gives a top-level block its ID. A block tag uses its `id` attribute. `visser ids assign` adds an unused random ID to each unmarked block. {% cite ref="src_assign" /%}

<!-- vs:id p_span -->
The {% term ref="def_target" %}target{% /term %} starts at its marker and ends at its block end. {% cite ref="src_span" /%} Move both together, and the target keeps its ID. Remove the marker, and `check` reports `E_ID_MISSING`.

<!-- vs:id h_packet -->
## A packet records two checks

<!-- vs:id p_packet_intro -->
The two hashes answer different questions about a held packet.

{% transform id="tf_packet" title="From source bytes to a reference packet" question="Which parts of the file end up in a packet, and what is lost on the way?" %}
The packet carries names and hashes. The target text stays in the document.

{% stage id="sg_bytes" label="Bundle files" representation="UTF-8 bytes of each declared file" location="document folder" evidence=["src_revision"] /%}

{% stage id="sg_span" label="Target span" representation="bytes from the marker to the block end" location="index.md" evidence=["src_span"] /%}

{% stage id="sg_body" label="Body hash" representation="SHA-256 of normalized target text" evidence=["src_body_hash"] /%}

{% stage id="sg_rev" label="Source revision" representation="SHA-256 of the sorted file manifest" evidence=["src_revision"] /%}

{% stage id="sg_ref" label="Reference packet" representation="YAML with IDs and two hashes" location="agent or clipboard" /%}

{% conversion id="cv_parse" from="sg_bytes" to="sg_span" label="find the block" /%}

{% conversion id="cv_hash_body" from="sg_span" to="sg_body" label="normalize then hash" loss="text and line ending style" /%}

{% conversion id="cv_manifest" from="sg_bytes" to="sg_rev" label="hash the manifest" loss="file text" /%}

{% conversion id="cv_issue_body" from="sg_body" to="sg_ref" label="copy the hash" /%}

{% conversion id="cv_issue_rev" from="sg_rev" to="sg_ref" label="copy the hash" /%}
{% /transform %}

<!-- vs:id p_hashes -->
Visser decodes the span as UTF-8. It removes one leading BOM and changes CRLF or CR to LF. It then hashes the text. {% cite ref="src_body_hash" /%} Line ending changes alone change neither hash. A source revision hashes a sorted manifest of the document ID and declared file hashes. Any other declared-file change changes the revision. {% cite ref="src_revision" /%}

<!-- vs:id p_lookup -->
A packet names a document by `docId`, not its path. The resolver searches configured document roots for that ID. {% cite ref="src_locate" /%} A move inside those roots keeps the packet useful. Two files with one `docId` produce `ambiguous`.

<!-- vs:id h_aging -->
## Resolution tells the agent what changed

<!-- vs:id p_aging_intro -->
The resolver compares a held packet with the current document.

{% graph id="lifecycle" mode="state" title="What a held packet resolves to as the document changes" question="Which edits make a packet stale, which make it unusable, and what brings an agent back to an exact packet?" %}
The states are answers for one held packet. A refresh makes a new packet.

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

{% transition id="tr_hand_delete" from="st_exact" to="st_missing" event="hand deletion or error" label="hand deletion or error" /%}

{% transition id="tr_fixed" from="st_missing" to="st_stale_same" event="error fixed" label="error fixed" /%}
{% /graph %}

<!-- vs:id p_stale -->
The resolver returns `deleted` for a retired absent ID. It returns `missing` for another absent ID. A present target is `exact` when both hashes match. A changed revision produces `stale` and reports the body match. {% cite ref="src_resolve_status" /%}

<!-- vs:id p_refresh -->
`refs refresh` needs the current revision and `--acknowledge-stale`. A changed target body also needs `--acknowledge-body-change`. The agent must read the new text before it gives that acknowledgement. {% cite ref="src_refresh" /%}

<!-- vs:id p_missing_caveat -->
One file error makes every packet resolve `missing`. The resolver refuses to guess positions in an invalid document. {% cite ref="src_resolve_errors" /%} Fix the error first. A held packet then usually resolves `stale`.

<!-- vs:id h_why_ids -->
## An ID survives ordinary edits

{% compare id="cmp_handles" title="Four ways to point at a paragraph" question="Which way of naming a target still names the same target after ordinary edits?" %}
The ID stays with its marked block. The other names depend on text or position.

{% option id="o_id" label="Target ID" /%}
{% option id="o_heading" label="Heading text" /%}
{% option id="o_line" label="Line number" /%}
{% option id="o_quote" label="Quoted text" /%}

{% criterion id="c_reword" label="The target is reworded" /%}
{% criterion id="c_elsewhere" label="Text above the target changes" /%}
{% criterion id="c_move" label="The target moves in the file" /%}
{% criterion id="c_unique" label="Two targets have the same text" /%}

{% cell id="x_id_reword" option="o_id" criterion="c_reword" %}
The packet is stale with changed text.
{% /cell %}

{% cell id="x_id_elsewhere" option="o_id" criterion="c_elsewhere" %}
The packet is stale with unchanged text.
{% /cell %}

{% cell id="x_id_move" option="o_id" criterion="c_move" %}
The ID moves with the marker.
{% /cell %}

{% cell id="x_id_unique" option="o_id" criterion="c_unique" %}
The unique ID keeps them distinct.
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
A packet may still carry a quote and a label. They help a person or agent confirm the intended text. The resolver reports a match, but never chooses a target from either hint. {% cite ref="src_resolve_status" /%}

<!-- vs:id h_change -->
## Changing and removing a target

<!-- vs:id p_replace -->
`refs replace` rewrites one target in a guarded write. Under the lock it resolves the packet again. It refuses a non-`exact` packet or a stale `--expected-revision`. {% cite ref="src_replace_guard" /%} The replacement keeps its target ID. It keeps each old nested ID exactly once. A replacement can add blocks beside the kept target. A new block cannot reuse an ID from elsewhere in the document. {% cite ref="src_retention" /%} Use `--retire ID --reason TEXT` to drop a nested target.

<!-- vs:id p_retire -->
`refs retire` removes a target and records its ID in `retiredTargets`. The record can include a reason and a replacement. It refuses a live referrer, a removed replacement, or a replacement chain. {% cite ref="src_retire" /%} To merge two paragraphs, replace the kept paragraph first. Then retire the other paragraph and name the kept one as its replacement. Old packets then resolve `deleted` and point to it.

<!-- vs:id h_breaks -->
## What breaks an ID

<!-- vs:id l_breaks -->
- **Copying a document folder with `cp`.** Both copies keep the same `docId`, so every packet for them becomes `ambiguous`. Use `visser fork`, which gives the copy a new `docId`. {% cite ref="src_locate" /%} {% cite ref="src_fork" /%}
- **Deleting a block by hand.** The ID disappears with no retirement record, so old packets say `missing` instead of `deleted`, and nobody learns why. {% cite ref="src_resolve_status" /%}
- **Renaming an ID.** To the resolver, a renamed ID is an old ID with no retirement record plus a new one, so old packets resolve `missing`. Keep the ID when the text changes; change it only when the meaning changes.
- **Pasting a block without its marker.** The block gets no ID, or a new one from `ids assign`, and old packets for the original are `missing`.
- **Leaving an error in the file.** Every packet resolves `missing` until the error is fixed. {% cite ref="src_resolve_errors" /%}

<!-- vs:id p_limits -->
These rules protect a target's identity, not its truth. An `exact` packet lets an agent edit the text that the reader saw. It does not prove that text is correct. Unchanged target text can sit beside changed context.

{% source id="src_assign" kind="working-tree" title="ids assign: a random ID for each block without a marker" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/syntax/ids.ts" start=48 end=67 capturedAt="2026-09-28T15:05:07Z" excerptSha256="8b89665cce577b594b3d0ccd97625f7fa33db6ef73193c84774b6a085fe07f3e" originFileSha256="8195ddacd7de8038a374062a56142543d705bc36240bcf003e46953d3bbfb376" %}
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

{% source id="src_span" kind="working-tree" title="A marker target spans from its marker line" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/syntax/parse.ts" start=183 end=190 capturedAt="2026-09-28T15:05:07Z" excerptSha256="43ee28ec8df709bd40c1a54202981be497ee24fea8d0dc266521d88493777483" originFileSha256="0a2e86b9f0bc5b08ebccf3093dfe15e453a5c66ac0dfbe944af952132f514e7a" %}
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

{% source id="src_body_hash" kind="working-tree" title="bodySha256 uses normalized span text" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/model/hash.ts" start=36 end=57 capturedAt="2026-09-28T15:05:07Z" excerptSha256="69bcd458f56781723036e6875b2fee518bc3a657811f54d3e3ee8aaecbad9ad9" originFileSha256="184a333e66f27504ab291c00e45de4ef66b764151e9c0cf71a094213010a527d" %}
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

{% source id="src_revision" kind="working-tree" title="sourceRevision hashes the canonical manifest" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/model/hash.ts" start=203 end=236 capturedAt="2026-09-28T15:05:08Z" excerptSha256="f52f79f3ac3a379c3ace6296ddb7e8bcc762c1412d60ee99880bcccaa352d0e2" originFileSha256="184a333e66f27504ab291c00e45de4ef66b764151e9c0cf71a094213010a527d" %}
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

{% source id="src_locate" kind="working-tree" title="Find a document by docId in document roots" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/registry.ts" start=118 end=126 capturedAt="2026-09-28T15:19:47Z" excerptSha256="a26e405e7d72b4d6258e4d70d159e13fe95a906d5325bb92470ac5b7c32cd7a1" originFileSha256="dea27e769b4c1f4d161937a24f00e662329eb3473c6721f70bc8469f5284d367" %}
```typescript
    return undefined;
  }
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/);
  if (lines[0] !== '---') return undefined;
  for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
    const m = /^docId:\s*["']?([0-9a-f-]+)["']?\s*$/.exec(lines[i] ?? '');
    if (m) return m[1];
  }
  return undefined;
```
{% /source %}

{% source id="src_resolve_status" kind="working-tree" title="Resolver returns deleted, missing, exact, stale, or invalid" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/resolve.ts" start=134 end=185 capturedAt="2026-09-28T15:05:22Z" excerptSha256="25dc4ec4fdbebe7945a0397e7c95f4494f755106c92e197b9e817287cc791a5d" originFileSha256="58d4f922fe307c0a0b149925e9f842bcc935b488db37718d7c90b36ea53f988a" %}
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

{% source id="src_refresh" kind="working-tree" title="refs refresh requires two acknowledgements" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/refresh.ts" start=42 end=53 capturedAt="2026-09-28T15:05:22Z" excerptSha256="bdf70bf0b8209f7686016b7b45d5b3812130e247f7d2f1641a67b144db4ca16e" originFileSha256="10780266415ecc9e8dc66f5540512ef5220c439ef8002700be19b00ee1851e57" %}
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

{% source id="src_resolve_errors" kind="working-tree" title="Resolver returns missing for an invalid document" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/resolve.ts" start=116 end=129 capturedAt="2026-09-28T15:05:22Z" excerptSha256="9b7836828434ba54b1a8fd4257153e4ee43ee3c80542e1d947ed57d3c51026c9" originFileSha256="58d4f922fe307c0a0b149925e9f842bcc935b488db37718d7c90b36ea53f988a" %}
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

{% source id="src_replace_guard" kind="working-tree" title="refs replace refuses a stale packet or revision" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/replace.ts" start=116 end=134 capturedAt="2026-09-28T15:05:35Z" excerptSha256="7bb2e3d68933140c46838422f0d1ca858a610ee2471d95df4d3a162291a37be2" originFileSha256="0e092484068fc99e5d5b677d6eb0d01507e799a8ca015f7f3a98a6b224d2393b" %}
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

{% source id="src_retention" kind="working-tree" title="refs replace keeps nested target IDs" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/replace.ts" start=90 end=110 capturedAt="2026-09-28T15:05:35Z" excerptSha256="95e613180d20948e29262a14716911410e5edc0c97f6753845ab575ee3bb5df0" originFileSha256="0e092484068fc99e5d5b677d6eb0d01507e799a8ca015f7f3a98a6b224d2393b" %}
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

{% source id="src_retire" kind="working-tree" title="refs retire checks replacements and referrers" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/retire.ts" start=99 end=110 capturedAt="2026-09-28T15:05:35Z" excerptSha256="fee9a3eda04cf85cef52cad36a61b9db11e04bc35132f44478f54a2c145b419d" originFileSha256="c278da22b0d8a01b7659eb46ad9b183a21a010869f7eca22f820c02190ba0e9d" %}
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

{% source id="src_fork" kind="working-tree" title="fork gives the copy a new random docId" language="typescript" repository="https://github.com/russellsch/visser.git" baseCommit="ab5eec8ca86b636e592805230041f00725181c94" file="packages/core/src/references/fork.ts" start=86 end=101 capturedAt="2026-09-28T15:05:36Z" excerptSha256="157d06dde9b7078062682c9d1ddfdb472fb6f81b57e39a97712fd911db65315e" originFileSha256="70ff3c6ccc9a0053ebf1c4838a29e55af91ba8f87b16cf5eb932a31543f1cf54" %}
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
