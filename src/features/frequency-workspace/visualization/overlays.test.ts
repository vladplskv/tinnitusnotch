import { describe, expect, test } from 'vitest';

import type { TherapyPlaybackSnapshot, TherapySession } from '../index';
import {
  buildVisualizationDescription,
  whiteNoiseNotchDecibels,
} from './overlays';

const stoppedPlayback: TherapyPlaybackSnapshot = {
  status: 'stopped',
  source: { kind: 'none' },
  error: null,
  spectrum: {
    sampleRate: 48_000,
    fftSize: 8_192,
    minDecibels: -100,
    maxDecibels: 0,
    smoothing: 0.8,
  },
};

const baseSession: TherapySession = {
  tinnitusMatch: {
    frequencyHz: 3_000,
    type: 'tone',
    audibilityByFrequencyHz: {},
  },
  masterGain: 0.1,
  selectedFilterId: 'white-noise',
  filterSettings: {
    'white-noise': { q: 1 },
    'decorrelating-am': {
      hearingCorrection: 'a1',
      confirmedProjectionHz: 4_000,
    },
  },
};

describe('Therapy Filter visualization descriptions', () => {
  test('describes the calculated White Noise response and its 3 dB notch', () => {
    const description = buildVisualizationDescription(
      baseSession,
      stoppedPlayback,
    );

    expect(whiteNoiseNotchDecibels(3_000, 3_000, 1)).toBe(-100);
    expect(
      whiteNoiseNotchDecibels(3_000 * 0.618_033_988_75, 3_000, 1),
    ).toBeCloseTo(-3.0103, 3);
    expect(description.bands).toEqual([
      expect.objectContaining({
        fromHz: expect.closeTo(1_854.1, 0),
        toHz: expect.closeTo(4_854.1, 0),
        label: 'Calculated notch ≥ 3 dB',
        pattern: 'hatched',
      }),
    ]);
    expect(description.responseCurves[0]?.points).toContainEqual({
      frequencyHz: 3_000,
      decibels: -100,
    });
  });

  test('describes only the confirmed AM Active Band', () => {
    const session: TherapySession = {
      ...baseSession,
      selectedFilterId: 'decorrelating-am',
    };

    expect(buildVisualizationDescription(session, stoppedPlayback)).toEqual(
      expect.objectContaining({
        bands: [
          expect.objectContaining({
            fromHz: expect.closeTo(2_828.4, 0),
            toHz: expect.closeTo(5_656.9, 0),
            label: 'Confirmed Active Band',
          }),
        ],
        responseCurves: [],
      }),
    );
  });

  test('marks the configured effect as future therapy during a Matching Stimulus', () => {
    const previewing: TherapyPlaybackSnapshot = {
      ...stoppedPlayback,
      status: 'previewing',
      source: { kind: 'matching-stimulus' },
    };

    expect(
      buildVisualizationDescription(baseSession, previewing).bands[0]?.line,
    ).toBe('dashed');
  });
});
