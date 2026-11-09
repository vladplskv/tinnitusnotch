import type { TinnitusMatch } from '../../model/types';
import { describe, expect, it } from 'vitest';

import type { TherapySession } from '../../model/types';
import {
  getActiveBandStatus,
  resolvePaper2025V1ActiveBand,
  TINNITUS_MATCH_FREQUENCIES_HZ,
} from './active-band';

function match(
  frequencyHz: number,
  overrides: Readonly<Record<string, 'audible' | 'inaudible' | 'unknown'>> = {},
): TinnitusMatch {
  return {
    frequencyHz,
    type: 'tone',
    audibilityByFrequencyHz: Object.fromEntries(
      TINNITUS_MATCH_FREQUENCIES_HZ.map(value => [
        String(value),
        overrides[String(value)] ?? 'audible',
      ]),
    ),
  };
}

describe('paper-2025-v1 Active Band resolution', () => {
  it('resolves the accepted A1 band from the confirmed projection', () => {
    expect(resolvePaper2025V1ActiveBand(match(4_000), 4_000)).toEqual({
      kind: 'resolved',
      bandHz: [2_800, 5_700],
    });
  });

  it('selects A2 when any A1 observation is inaudible', () => {
    expect(
      resolvePaper2025V1ActiveBand(
        match(4_800, { '8000': 'inaudible' }),
        4_800,
      ),
    ).toEqual({ kind: 'resolved', bandHz: [2_800, 5_700] });
  });

  it('blocks AM while any required observation is unknown', () => {
    expect(
      resolvePaper2025V1ActiveBand(match(4_800, { '1000': 'unknown' }), 4_800),
    ).toEqual({ kind: 'unavailable', reason: 'audibility-incomplete' });
  });

  it('reports an unavailable match when fallback is required but unspecified', () => {
    expect(
      resolvePaper2025V1ActiveBand(
        match(1_000, { '1200': 'inaudible' }),
        1_000,
      ),
    ).toEqual({ kind: 'unavailable', reason: 'fallback-unavailable' });
  });

  describe('Active Band status for display', () => {
    const session = (
      frequencyHz: number,
      confirmedProjectionHz: number | null,
      overrides: Readonly<
        Record<string, 'audible' | 'inaudible' | 'unknown'>
      > = {},
    ): TherapySession => ({
      tinnitusMatch: match(frequencyHz, overrides),
      masterGain: 0.1,
      selectedFilterId: 'decorrelating-am',
      filterSettings: {
        'white-noise': { q: 1 },
        'decorrelating-am': { hearingCorrection: 'a1', confirmedProjectionHz },
        'cr-neuromodulation': {
          notchedNoise: false,
          noiseLevel: 0.3,
          notchQ: 1,
        },
      },
    });

    it('shows the primary band before confirmation', () => {
      expect(getActiveBandStatus(session(3_000, null))).toMatchObject({
        projectionHz: 2_800,
        confirmed: false,
        bandHz: [2_000, 4_000],
        blocked: false,
      });
    });

    it('treats a confirmation for another projection as unconfirmed', () => {
      expect(getActiveBandStatus(session(3_000, 4_000)).confirmed).toBe(false);
    });

    it('reports the neighbouring band and a blocked AM', () => {
      expect(
        getActiveBandStatus(session(4_800, 4_800, { '8000': 'inaudible' })),
      ).toMatchObject({ bandHz: [2_800, 5_700], fallback: true });
      expect(
        getActiveBandStatus(session(4_800, 4_800, { '4800': 'inaudible' })),
      ).toMatchObject({ bandHz: null, blocked: true });
    });
  });
});
