import { describe, expect, test } from 'vitest';

import { aggregateSpectrumByPixel } from './spectrum';

describe('Frequency Visualization spectrum aggregation', () => {
  test('keeps the strongest analyser bin when bins share a pixel', () => {
    const bins = new Float32Array(4_096).fill(-100);
    bins[171] = -40;
    bins[172] = -12;

    const pixels = aggregateSpectrumByPixel(bins, {
      sampleRate: 48_000,
      fftSize: 8_192,
      width: 300,
      minDecibels: -100,
    });

    const strongestPixel = pixels.findIndex(value => value === -12);
    expect(strongestPixel).toBeGreaterThanOrEqual(0);
    expect(pixels[strongestPixel]).toBe(-12);
    expect(Array.from(pixels).filter(value => value > -100)).toEqual([-12]);
  });

  test('ignores analyser bins outside the plotted 20 through 22,000 Hz range', () => {
    const bins = new Float32Array(4_096).fill(-100);
    bins[1] = -5;
    bins[341] = -18;
    bins[3_755] = -3;

    expect(
      aggregateSpectrumByPixel(bins, {
        sampleRate: 48_000,
        fftSize: 8_192,
        width: 1,
        minDecibels: -100,
      }),
    ).toEqual(new Float32Array([-18]));
  });
});
