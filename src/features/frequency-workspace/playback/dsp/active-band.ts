import { getNearestAMProjectionHz } from '../../model/session';
import type { TherapySession, TinnitusMatch } from '../../model/types';

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

/**
 * What De-correlating AM will modulate for the session, for display. The
 * band follows the projection nearest to the Tinnitus Frequency; it counts
 * only when the user confirmed that projection. While audibility is still
 * incomplete the primary band is shown; a neighbouring band replaces it when
 * the primary one touches an inaudible frequency, and AM is blocked when no
 * band is left.
 */
export interface ActiveBandStatus {
  /** Control frequency nearest to the Tinnitus Frequency. */
  readonly projectionHz: number;
  /** The projection the user confirmed, possibly for an older frequency. */
  readonly confirmedProjectionHz: number | null;
  readonly confirmed: boolean;
  /** The band this projection prefers when every frequency is audible. */
  readonly primaryBandHz: FrequencyBandHz | null;
  /** The band playback would use, or the primary one while it is unknown. */
  readonly bandHz: FrequencyBandHz | null;
  /** A neighbouring band replaced the primary one. */
  readonly fallback: boolean;
  /** Confirmed, but every usable band has an inaudible frequency. */
  readonly blocked: boolean;
}

export function getActiveBandStatus(session: TherapySession): ActiveBandStatus {
  const match = session.tinnitusMatch;
  const projectionHz = getNearestAMProjectionHz(match.frequencyHz);
  const confirmedProjectionHz =
    session.filterSettings['decorrelating-am'].confirmedProjectionHz;
  const confirmed = confirmedProjectionHz === projectionHz;
  const preference = ACTIVE_BAND_BY_MATCH_HZ[projectionHz];
  const primaryBandHz = preference
    ? MODULATION_BANDS_HZ[preference.primary]
    : null;
  const resolution = confirmed
    ? resolvePaper2025V1ActiveBand(match, projectionHz)
    : null;
  const blocked =
    resolution?.kind === 'unavailable' &&
    resolution.reason !== 'audibility-incomplete';
  const bandHz =
    resolution?.kind === 'resolved' ? resolution.bandHz : primaryBandHz;

  return {
    projectionHz,
    confirmedProjectionHz,
    confirmed,
    primaryBandHz,
    bandHz: blocked ? null : bandHz,
    fallback:
      resolution?.kind === 'resolved' &&
      primaryBandHz !== null &&
      resolution.bandHz !== primaryBandHz,
    blocked,
  };
}
