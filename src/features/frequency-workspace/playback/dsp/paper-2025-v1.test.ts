import { describe, expect, it } from 'vitest';

import {
  createPaper2025V1Renderer,
  getPaper2025V1HearingGain,
  type Paper2025V1Configuration,
} from './paper-2025-v1';

const CONFIGURATION: Paper2025V1Configuration = {
  contractVersion: 'paper-2025-v1',
  sampleRate: 44_100,
  activeBandHz: [4_000, 8_000],
  hearingCorrection: 'a1',
  seed: 0x1234_5678,
};

function renderInChunks(chunkSizes: readonly number[]): Float32Array {
  const renderer = createPaper2025V1Renderer(CONFIGURATION);
  const result = new Float32Array(
    chunkSizes.reduce((total, size) => total + size, 0),
  );
  let offset = 0;

  for (const chunkSize of chunkSizes) {
    renderer.process(result.subarray(offset, offset + chunkSize));
    offset += chunkSize;
  }

  return result;
}

describe('paper-2025-v1 DSP', () => {
  it('produces the same fixed-seed stream regardless of render block boundaries', () => {
    const sampleCount = 44_100 * 8 + 317;
    const uninterrupted = renderInChunks([sampleCount]);
    const irregular = renderInChunks([
      1,
      127,
      128,
      4_096,
      44_100,
      91_337,
      sampleCount - 1 - 127 - 128 - 4_096 - 44_100 - 91_337,
    ]);

    expect(irregular).toEqual(uninterrupted);
  });

  it('starts and ends every four-second segment at silence', () => {
    const samples = renderInChunks([44_100 * 8]);

    expect(samples[0]).toBe(0);
    expect(Math.abs(samples[44_100 * 4 - 1])).toBeLessThan(1e-12);
    expect(samples[44_100 * 4]).toBe(0);
    expect(Math.abs(samples[44_100 * 8 - 1])).toBeLessThan(1e-12);
    expect(samples.some(sample => sample !== 0)).toBe(true);
  });

  it('uses the accepted logarithmic hearing-correction control points', () => {
    expect(getPaper2025V1HearingGain('a1', 16_000)).toBe(1);
    expect(20 * Math.log10(getPaper2025V1HearingGain('a2', 2_000))).toBeCloseTo(
      0,
      10,
    );
    expect(20 * Math.log10(getPaper2025V1HearingGain('a2', 2_800))).toBeCloseTo(
      15 / 9,
      10,
    );
    expect(20 * Math.log10(getPaper2025V1HearingGain('a2', 8_000))).toBeCloseTo(
      (15 * 8) / 9,
      10,
    );
    expect(
      20 * Math.log10(getPaper2025V1HearingGain('a2', 16_000)),
    ).toBeCloseTo(15, 10);
  });

  it('keeps long-run un-ramped energy near the fixed 0.01 RMS target', () => {
    const samples = renderInChunks([44_100 * 12]);
    let sumSquares = 0;
    let count = 0;

    for (let segment = 0; segment < 3; segment += 1) {
      const start = segment * 44_100 * 4 + 44_100;
      const end = segment * 44_100 * 4 + 44_100 * 3;
      for (let index = start; index < end; index += 1) {
        sumSquares += samples[index] ** 2;
        count += 1;
      }
    }

    expect(Math.sqrt(sumSquares / count)).toBeGreaterThan(0.008);
    expect(Math.sqrt(sumSquares / count)).toBeLessThan(0.012);
  });

  it('keeps mathematical headroom and randomizes consecutive carrier segments', () => {
    const samples = renderInChunks([44_100 * 8]);
    const segmentLength = 44_100 * 4;
    let peak = 0;
    let dotProduct = 0;
    let firstEnergy = 0;
    let secondEnergy = 0;

    for (let index = 0; index < segmentLength; index += 1) {
      const first = samples[index];
      const second = samples[index + segmentLength];
      peak = Math.max(peak, Math.abs(first), Math.abs(second));
      dotProduct += first * second;
      firstEnergy += first * first;
      secondEnergy += second * second;
    }

    expect(peak).toBeLessThan(0.5);
    expect(
      Math.abs(dotProduct / Math.sqrt(firstEnergy * secondEnergy)),
    ).toBeLessThan(0.1);
  });
});
