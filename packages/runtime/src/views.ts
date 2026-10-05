// A single document control switches mapped figures to their accessible text.
// Unsupported narrow renderers retain their established list fallback.
export type FigureView = 'list' | 'map';
export function figureView(narrow: boolean, textView: boolean, viewerCapable = true): FigureView {
  return textView || (narrow && !viewerCapable) ? 'list' : 'map';
}
export const VIEW_CLASS: Record<FigureView, string> = { list: 'vs-view-list', map: 'vs-view-map' };
