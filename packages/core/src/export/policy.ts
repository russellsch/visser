// Public-export policy (§13.5). The report lists every source whose kind is
// not `example` or `supplied`, whatever the document's visibility. A public
// export needs --allow-private-content for a `visibility: private` document
// and for each listed source whose `repository` is not in the user-config
// allowlist. A source without a `repository` (a file or web source) cannot be
// allowlisted, so it always needs the flag.
import type { Diagnostic } from '../types.ts';
import type { LoadedBundle } from '../model/bundle.ts';

export type ExportSource = {
  docId: string;
  id: string;
  kind: string;
  repository?: string;
  url?: string;
  label?: string;
  publicRepository: boolean;
};

export type ExportedDocument = {
  docId: string;
  title: string;
  visibility: 'private' | 'public';
  path: string;
};

const NOT_LISTED = new Set(['example', 'supplied']);

export function exportSources(bundle: LoadedBundle, allowlist: ReadonlySet<string>): ExportSource[] {
  const out: ExportSource[] = [];
  for (const target of bundle.parsed.targets) {
    if (target.tagName !== 'source') continue;
    const a = target.attributes;
    const kind = String(a['kind']);
    if (NOT_LISTED.has(kind)) continue;
    const text = (name: string) => (typeof a[name] === 'string' && a[name] !== '' ? { [name]: a[name] as string } : {});
    const repository = typeof a['repository'] === 'string' ? a['repository'] : undefined;
    out.push({
      docId: bundle.docId!,
      id: target.id,
      kind,
      ...text('repository'),
      ...text('url'),
      ...text('label'),
      publicRepository: repository !== undefined && allowlist.has(repository),
    });
  }
  return out;
}

/** The E_PRIVATE_EXPORT diagnostics that stop a public export without --allow-private-content. */
export function publicExportProblems(documents: readonly ExportedDocument[], sources: readonly ExportSource[]): Diagnostic[] {
  const problems: Diagnostic[] = [];
  for (const doc of documents) {
    if (doc.visibility !== 'public') {
      problems.push({
        code: 'E_PRIVATE_EXPORT', severity: 'error',
        message: `document ${doc.docId} ("${doc.title}") has visibility: private`,
        suggestedAction: 'pass --allow-private-content after you review the document, or set visibility: public in its frontmatter',
      });
    }
  }
  for (const s of sources) {
    if (s.publicRepository) continue;
    const origin = s.repository ? `repository ${s.repository}` : s.url ? `url ${s.url}` : s.label ? `label ${s.label}` : 'no recorded repository';
    problems.push({
      code: 'E_PRIVATE_EXPORT', severity: 'error',
      message: `document ${s.docId}: source ${s.id} (${s.kind}, ${origin}) is not from a repository in the publicRepositories allowlist`,
      targetId: s.id,
      suggestedAction: 'add the repository to publicRepositories in your user config (~/.visser/config.json), or pass --allow-private-content after review',
    });
  }
  return problems;
}
