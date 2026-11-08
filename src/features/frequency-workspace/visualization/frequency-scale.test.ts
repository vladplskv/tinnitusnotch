import { describe, expect, test } from 'vitest';

import {
  frequencyAtPosition,
  frequencyPosition,
  frequencyMarker,
} from './frequency-scale';

describe('Frequency Visualization logarithmic scale', () => {
  test('places octave steps at equal horizontal distances', () => {
    expect(frequencyPosition(20, 900)).toBe(0);
    expect(frequencyPosition(200, 900)).toBeCloseTo(296.0, 0);
    expect(frequencyPosition(2_000, 900)).toBeCloseTo(591.9, 0);
    expect(frequencyPosition(22_000, 900)).toBe(900);
  });

  test('maps a horizontal position back to its plotted frequency', () => {
    expect(frequencyAtPosition(0, 900)).toBe(20);
    expect(frequencyAtPosition(900, 900)).toBe(22_000);
    expect(frequencyAtPosition(frequencyPosition(3_000, 900), 900)).toBeCloseTo(
      3_000,
      8,
    );
  });

  test('docks a valid sub-20 Hz match at the left edge without changing it', () => {
    expect(frequencyMarker(12, 900)).toEqual({
      exactFrequencyHz: 12,
      x: 0,
      outsideScale: true,
      label: '12 Hz · < 20 Hz',
    });
  });
});
