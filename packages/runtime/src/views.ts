// Narrow-screen alternate views for figures (§9.3–9.10, R06). A figure with a
// map (data-ex-views) shows its lists by default on narrow screens; "Show map"
// switches to the map. Wide screens show both, and no toggle is needed.

export type FigureView = 'both' | 'list' | 'map';

/** The view a figure shows: wide screens show both; narrow screens honour the reader's choice. */
export function figureView(narrow: boolean, mapChosen: boolean): FigureView {
  if (!narrow) return 'both';
  return mapChosen ? 'map' : 'list';
}

export const VIEW_CLASS: Record<FigureView, string | undefined> = {
  both: undefined,
  list: 'ex-view-list',
  map: 'ex-view-map',
};
