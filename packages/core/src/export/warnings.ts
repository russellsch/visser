// Warnings in the export report (§13.5). They describe limits of static
// hosting and of privacy; they never make an export fail.
export type ExportWarning = { code: string; message: string };

export const STATIC_HOST_WARNINGS: readonly ExportWarning[] = [
  {
    code: 'W_STATIC_HOST_FRAMING',
    message: 'a static host cannot set frame-ancestors through a meta element; set a frame-ancestors header on the host if other sites must not frame these pages',
  },
  {
    code: 'W_STATIC_HOST_SRI',
    message: 'a host or proxy that rewrites JavaScript breaks Subresource Integrity; reader.js then does not run, and Mermaid pages show their failure notice',
  },
];

export function privateOriginWarning(count: number): ExportWarning {
  return {
    code: 'W_PRIVATE_ORIGIN',
    message: `${count} exported source${count === 1 ? '' : 's'} came from a repository or file that is not in the publicRepositories allowlist; a public static site cannot enforce the access controls of the origin repository`,
  };
}

/**
 * Sources that pass the publicRepositories allowlist pass by the repository
 * name recorded in the document. The author writes that name (for example with
 * `capture git --repository-label`), and nothing checks it against the real
 * origin, so the report names each one for review.
 */
export function publicByNameWarning(sources: ReadonlyArray<{ docId: string; id: string; repository?: string }>): ExportWarning {
  const list = sources.map((s) => `${s.docId} ${s.id} (${s.repository ?? '?'})`).join(', ');
  return {
    code: 'W_PUBLIC_BY_NAME',
    message: `${sources.length} source${sources.length === 1 ? '' : 's'} passed the publicRepositories allowlist only by the repository name recorded in the document: ${list}. The allowlist trusts recorded names, not origins; confirm that each excerpt really comes from that public repository`,
  };
}
