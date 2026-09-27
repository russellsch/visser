import { describe, expect, it } from 'vitest';
import { figureView, VIEW_CLASS } from '../../packages/runtime/src/views.ts';

describe('figure views on narrow screens (§9.3, R06) @R06', () => {
  it('shows both views on wide screens, whatever the reader chose', () => {
    expect(figureView(false, false)).toBe('both');
    expect(figureView(false, true)).toBe('both');
    expect(VIEW_CLASS.both).toBeUndefined();
  });

  it('defaults to the list on narrow screens and shows the map only on request', () => {
    expect(figureView(true, false)).toBe('list');
    expect(figureView(true, true)).toBe('map');
    expect(VIEW_CLASS.list).toBe('vs-view-list');
    expect(VIEW_CLASS.map).toBe('vs-view-map');
  });
});
