import { describe, expect, it } from 'vitest';

import { getCRToneFrequenciesHz } from '../../model/cr-neuromodulation';
import {
  CR_TONE_SECONDS,
  createCRNeuromodulationRenderer,
  type CRNeuromodulationConfiguration,
} from './cr-neuromodulation';

const SAMPLE_RATE = 48_000;
const SLOT = Math.round(SAMPLE_RATE * CR_TONE_SECONDS);
const CONFIGURATION: CRNeuromodulationConfiguration = {
  sampleRate: SAMPLE_RATE,
  tinnitusFrequencyHz: 4_000,
  seed: 0x1234_5678,
};

function render(
  sampleCount: number,
  chunkSize = sampleCount,
  configuration = CONFIGURATION,
): Float32Array {
  const renderer = createCRNeuromodulationRenderer(configuration);
  const result = new Float32Array(sampleCount);
  for (let offset = 0; offset < sampleCount; offset += chunkSize) {
    renderer.process(
      result.subarray(offset, Math.min(sampleCount, offset + chunkSize)),
    );
  }
  return result;
}

/* Upward zero crossings over the steady middle of a slot give its tone. */
function slotFrequencyHz(samples: Float32Array, slot: number): number {
  const from = slot * SLOT + Math.round(SLOT * 0.2);
  const to = slot * SLOT + Math.round(SLOT * 0.8);
  let first = -1;
  let last = -1;
  let crossings = 0;
  for (let index = from + 1; index < to; index += 1) {
    if (samples[index - 1]! < 0 && samples[index]! >= 0) {
      if (first < 0) first = index;
      last = index;
      crossings += 1;
    }
  }
  return ((crossings - 1) * SAMPLE_RATE) / (last - first);
}

function slotPeak(samples: Float32Array, slot: number): number {
  let peak = 0;
  for (let index = slot * SLOT; index < (slot + 1) * SLOT; index += 1) {
    peak = Math.max(peak, Math.abs(samples[index]!));
  }
  return peak;
}

function nearestTone(frequencyHz: number, tonesHz: readonly number[]) {
  return tonesHz.reduce((best, toneHz) =>
    Math.abs(toneHz - frequencyHz) < Math.abs(best - frequencyHz)
      ? toneHz
      : best,
  );
}

describe('CR Neuromodulation DSP', () => {
  it('spaces the four tones as the checkhearing.org generator does', () => {
    expect(getCRToneFrequenciesHz(1_500)).toEqual([1_115, 1_333, 1_687, 2_119]);
    expect(getCRToneFrequenciesHz(4_000)).toEqual([3_047, 3_590, 4_412, 5_606]);
  });

  it('plays three cycles of all four tones in random order, then two silent cycles', () => {
    const periods = 3;
    const samples = render(SLOT * 20 * periods);
    const tonesHz = getCRToneFrequenciesHz(4_000);

    for (let period = 0; period < periods; period += 1) {
      for (let cycle = 0; cycle < 5; cycle += 1) {
        const slots = [0, 1, 2, 3].map(at => period * 20 + cycle * 4 + at);
        if (cycle >= 3) {
          for (const slot of slots) expect(slotPeak(samples, slot)).toBe(0);
          continue;
        }
        const heard = slots.map(slot => {
          const frequencyHz = slotFrequencyHz(samples, slot);
          const toneHz = nearestTone(frequencyHz, tonesHz);
          expect(Math.abs(frequencyHz - toneHz)).toBeLessThan(15);
          expect(slotPeak(samples, slot)).toBeCloseTo(1, 2);
          return toneHz;
        });
        expect([...heard].sort((a, b) => a - b)).toEqual([...tonesHz]);
      }
    }
  });

  it('starts and ends every tone at silence, so slots never click', () => {
    const samples = render(SLOT * 12);
    for (let slot = 0; slot < 12; slot += 1) {
      expect(Math.abs(samples[slot * SLOT]!)).toBe(0);
      expect(Math.abs(samples[(slot + 1) * SLOT - 1]!)).toBeLessThan(0.01);
    }
  });

  it('renders the same fixed-seed stream whatever the block size', () => {
    const whole = render(SLOT * 25);
    expect(render(SLOT * 25, 128)).toEqual(whole);
    expect(render(SLOT * 25, 317)).toEqual(whole);
  });

  it('varies the order between seeds', () => {
    const one = render(SLOT * 20);
    const other = render(SLOT * 20, SLOT * 20, { ...CONFIGURATION, seed: 7 });
    expect(other).not.toEqual(one);
  });

  it('applies a new frequency from the next tone', () => {
    const renderer = createCRNeuromodulationRenderer(CONFIGURATION);
    const samples = new Float32Array(SLOT * 4);
    renderer.process(samples.subarray(0, SLOT + SLOT / 2));
    renderer.setTinnitusFrequency(2_000);
    renderer.process(samples.subarray(SLOT + SLOT / 2));

    const oldTones = getCRToneFrequenciesHz(4_000);
    const newTones = getCRToneFrequenciesHz(2_000);
    const second = slotFrequencyHz(samples, 1);
    expect(Math.abs(nearestTone(second, oldTones) - second)).toBeLessThan(15);
    for (const slot of [2, 3]) {
      const frequencyHz = slotFrequencyHz(samples, slot);
      expect(
        Math.abs(nearestTone(frequencyHz, newTones) - frequencyHz),
      ).toBeLessThan(15);
    }
  });
});
