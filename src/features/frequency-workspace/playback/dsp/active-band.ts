import type { TinnitusMatch } from '../../model/types';

import type { FrequencyBandHz } from './paper-2025-v1';

export const TINNITUS_MATCH_FREQUENCIES_HZ = [
  1_000, 1_200, 1_400, 1_700, 2_000, 2_400, 2_800, 3_400, 4_000, 4_800, 5_700,
  6_700, 8_000, 9_500, 11_000, 13_000, 16_000,
] as const;

const MODULATION_BANDS_HZ = [
  [1_000, 2_000],
  [1_400, 2_800],
  [2_000, 4_000],
  [2_800, 5_700],
  [4_000, 8_000],
  [5_700, 11_000],
  [8_000, 16_000],
] as const satisfies readonly FrequencyBandHz[];

interface ActiveBandPreference {
  readonly primary: number;
  readonly fallback?: number;
}

const ACTIVE_BAND_BY_MATCH_HZ: Readonly<Record<number, ActiveBandPreference>> =
  {
    1_000: { primary: 0 },
    1_200: { primary: 0 },
    1_400: { primary: 0 },
    1_700: { primary: 1, fallback: 0 },
    2_000: { primary: 1 },
    2_400: { primary: 2, fallback: 1 },
    2_800: { primary: 2 },
    3_400: { primary: 3, fallback: 2 },
    4_000: { primary: 3 },
    4_800: { primary: 4, fallback: 3 },
    5_700: { primary: 4 },
    6_700: { primary: 5, fallback: 4 },
    8_000: { primary: 5 },
    9_500: { primary: 5 },
    11_000: { primary: 6 },
    13_000: { primary: 6 },
    16_000: { primary: 6 },
  };

export type ActiveBandResolution =
  | { readonly kind: 'resolved'; readonly bandHz: FrequencyBandHz }
  | {
      readonly kind: 'unavailable';
      readonly reason:
        | 'audibility-incomplete'
        | 'projection-unsupported'
        | 'fallback-unavailable'
        | 'fallback-inaudible';
    };

function bandHasInaudibleObservation(
  match: TinnitusMatch,
  band: FrequencyBandHz,
): boolean {
  return TINNITUS_MATCH_FREQUENCIES_HZ.some(
    frequencyHz =>
      frequencyHz >= band[0] &&
      frequencyHz <= band[1] &&
      match.audibilityByFrequencyHz[String(frequencyHz)] === 'inaudible',
  );
}

export function resolvePaper2025V1ActiveBand(
  match: TinnitusMatch,
  confirmedProjectionHz: number,
): ActiveBandResolution {
  if (
    TINNITUS_MATCH_FREQUENCIES_HZ.some(
      frequencyHz =>
        match.audibilityByFrequencyHz[String(frequencyHz)] === 'unknown' ||
        match.audibilityByFrequencyHz[String(frequencyHz)] === undefined,
    )
  ) {
    return { kind: 'unavailable', reason: 'audibility-incomplete' };
  }

  const preference = ACTIVE_BAND_BY_MATCH_HZ[confirmedProjectionHz];
  if (!preference) {
    return { kind: 'unavailable', reason: 'projection-unsupported' };
  }

  const primary = MODULATION_BANDS_HZ[preference.primary];
  if (!bandHasInaudibleObservation(match, primary)) {
    return { kind: 'resolved', bandHz: primary };
  }

  if (preference.fallback === undefined) {
    return { kind: 'unavailable', reason: 'fallback-unavailable' };
  }

  const fallback = MODULATION_BANDS_HZ[preference.fallback];
  if (bandHasInaudibleObservation(match, fallback)) {
    return { kind: 'unavailable', reason: 'fallback-inaudible' };
  }

  return { kind: 'resolved', bandHz: fallback };
}
