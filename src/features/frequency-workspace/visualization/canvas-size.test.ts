import { describe, expect, test } from 'vitest';

import { calculateCanvasSize } from './canvas-size';

describe('Frequency Visualization canvas sizing', () => {
  test('caps device pixel ratio at two while preserving CSS dimensions', () => {
    expect(calculateCanvasSize(360.4, 220, 3)).toEqual({
      cssWidth: 360.4,
      cssHeight: 220,
      pixelRatio: 2,
      backingWidth: 721,
      backingHeight: 440,
    });
  });

  test('falls back to a one-to-one backing buffer for invalid ratios', () => {
    expect(calculateCanvasSize(768, 320, 0)).toEqual({
      cssWidth: 768,
      cssHeight: 320,
      pixelRatio: 1,
      backingWidth: 768,
      backingHeight: 320,
    });
  });
});
