import { describe, expect, it } from 'vitest';
import { figureView, toggleLabel, VIEW_CLASS } from '../../packages/runtime/src/views.ts';

describe('figure views (§9.3, R06; IMPROVEMENTS.md §4.1) @R06', () => {
  it('shows the map on wide screens, and the lists under it only on request', () => {
    expect(figureView(false, false)).toBe('map');
    expect(figureView(false, true)).toBe('both');
    expect(VIEW_CLASS.both).toBeUndefined();
    expect(toggleLabel(false)).toBe('Show as list');
  });

  it('defaults to the list on narrow screens and shows the map only on request', () => {
    expect(figureView(true, false)).toBe('list');
    expect(figureView(true, true)).toBe('map');
    expect(VIEW_CLASS.list).toBe('vs-view-list');
    expect(VIEW_CLASS.map).toBe('vs-view-map');
    expect(toggleLabel(true)).toBe('Show map');
  });
});
