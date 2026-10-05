import { describe, expect, it } from 'vitest';
import { figureView, VIEW_CLASS } from '../../packages/runtime/src/views.ts';
describe('document text view @R06', () => {
  it('shows supported diagrams at either width until Text view is requested', () => {
    for (const narrow of [false, true]) {
      expect(figureView(narrow, false)).toBe('map');
      expect(figureView(narrow, true)).toBe('list');
    }
    expect(VIEW_CLASS.list).toBe('vs-view-list');
  });
  it('retains narrow fallback for an unverified renderer', () => {
    expect(figureView(true, false, false)).toBe('list');
    expect(figureView(false, false, false)).toBe('map');
  });
});
