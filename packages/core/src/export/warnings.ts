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
