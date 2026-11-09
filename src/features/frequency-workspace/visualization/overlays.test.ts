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
    'cr-neuromodulation': { notchedNoise: false, noiseLevel: 0.3, notchQ: 1 },
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

  test('centres the White Noise notch on the dragged preview frequency', () => {
    const description = buildVisualizationDescription(
      baseSession,
      stoppedPlayback,
      6_000,
    );

    expect(description.bands[0]).toEqual(
      expect.objectContaining({
        fromHz: expect.closeTo(3_708.2, 0),
        toHz: expect.closeTo(9_708.2, 0),
      }),
    );
  });

  test('describes the Active Band that AM playback will use', () => {
    const session: TherapySession = {
      ...baseSession,
      tinnitusMatch: { ...baseSession.tinnitusMatch, frequencyHz: 4_000 },
      selectedFilterId: 'decorrelating-am',
    };

    expect(buildVisualizationDescription(session, stoppedPlayback)).toEqual(
      expect.objectContaining({
        bands: [
          expect.objectContaining({
            fromHz: 2_800,
            toHz: 5_700,
            label: 'Confirmed Active Band',
          }),
        ],
        responseCurves: [],
      }),
    );
  });

  test('draws no AM band for a stale or blocked confirmation', () => {
    const stale: TherapySession = {
      ...baseSession,
      selectedFilterId: 'decorrelating-am',
    };
    const blocked: TherapySession = {
      ...stale,
      tinnitusMatch: {
        ...baseSession.tinnitusMatch,
        frequencyHz: 4_000,
        audibilityByFrequencyHz: Object.fromEntries(
          [
            1_000, 1_200, 1_400, 1_700, 2_000, 2_400, 2_800, 3_400, 4_000,
            4_800, 5_700, 6_700, 8_000, 9_500, 11_000, 13_000, 16_000,
          ].map(hz => [String(hz), 'inaudible' as const]),
        ),
      },
    };

    expect(buildVisualizationDescription(stale, stoppedPlayback).bands).toEqual(
      [],
    );
    expect(
      buildVisualizationDescription(blocked, stoppedPlayback).bands,
    ).toEqual([]);
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

  test('draws the CR notch only while notched noise is mixed in', () => {
    const session: TherapySession = {
      ...baseSession,
      selectedFilterId: 'cr-neuromodulation',
      filterSettings: {
        ...baseSession.filterSettings,
        'cr-neuromodulation': {
          notchedNoise: true,
          noiseLevel: 0.3,
          notchQ: 1,
        },
      },
    };

    expect(buildVisualizationDescription(session, stoppedPlayback)).toEqual(
      buildVisualizationDescription(baseSession, stoppedPlayback),
    );
  });

  test('draws no AM band over CR Neuromodulation, even with a confirmed AM band', () => {
    const session: TherapySession = {
      ...baseSession,
      tinnitusMatch: { ...baseSession.tinnitusMatch, frequencyHz: 4_000 },
      selectedFilterId: 'cr-neuromodulation',
    };

    expect(buildVisualizationDescription(session, stoppedPlayback)).toEqual({
      markers: [{ frequencyHz: 4_000, label: 'Tinnitus Frequency' }],
      bands: [],
      responseCurves: [],
    });
  });
});
