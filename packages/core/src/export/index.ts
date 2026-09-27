// Static site export (§13.1, §13.5): pure pieces that the CLI uses. This
// module reads the collection file and the user config; the CLI compiles the
// documents and writes the site.
export { readCollection, type Collection } from './collection.ts';
export { publicRepositories } from './user-config.ts';
export { exportSources, publicExportProblems, type ExportSource, type ExportedDocument } from './policy.ts';
export { collectionIndexHtml, COLLECTION_CSP, type IndexEntry } from './index-page.ts';
export { STATIC_HOST_WARNINGS, privateOriginWarning, publicByNameWarning, type ExportWarning } from './warnings.ts';
