// Figure views (§9.3–9.10, R06; docs/IMPROVEMENTS.md §4.1). A figure with a
// map (data-vs-views) has a toggle in its view bar. On narrow screens it shows
// its lists by default, and "Show map" switches to the map. On wide screens
// it shows the map by default, and "Show as list" adds the lists under it.
// Without JavaScript, in print, and in the Markdown projection the lists are
// always there.

export type FigureView = 'both' | 'list' | 'map';

/** The view a figure shows, from the screen width and the reader's toggle. */
export function figureView(narrow: boolean, toggled: boolean): FigureView {
  if (narrow) return toggled ? 'map' : 'list';
  return toggled ? 'both' : 'map';
}

/** The label of the view toggle: it names the view that the toggle adds. */
export function toggleLabel(narrow: boolean): string {
  return narrow ? 'Show map' : 'Show as list';
}

export const VIEW_CLASS: Record<FigureView, string | undefined> = {
  both: undefined,
  list: 'vs-view-list',
  map: 'vs-view-map',
};
