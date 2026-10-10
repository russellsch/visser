/** Exact marker preserved in both bundled reader assets. Bump on incompatible DOM changes. */
export const FLOWCHART_READER_CONTRACT = 'visser-flowchart-reader/1';
export const FLOWCHART_READER_MARKER = `/*! ${FLOWCHART_READER_CONTRACT} */`;

/** Call only on the integrity-verified selected asset bytes. */
export function flowchartReaderContracts(js: string, css: string): readonly string[] {
  return js.includes(FLOWCHART_READER_MARKER) && css.includes(FLOWCHART_READER_MARKER) ? [FLOWCHART_READER_CONTRACT] : [];
}
