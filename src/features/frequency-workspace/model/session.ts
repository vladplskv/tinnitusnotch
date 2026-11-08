import type {
  Audibility,
  HearingCorrectionId,
  TherapyFilterId,
  TherapySession,
  TinnitusType,
} from './types';

export const AM_MATCH_FREQUENCIES_HZ = [
  1000, 1200, 1400, 1700, 2000, 2400, 2800, 3400, 4000, 4800, 5700, 6700, 8000,
  9500, 11000, 13000, 16000,
] as const;

export const MIN_TINNITUS_FREQUENCY_HZ = 1;
export const MAX_TINNITUS_FREQUENCY_HZ = 22_000;
export const MIN_WHITE_NOISE_Q = 0.1;
export const MAX_WHITE_NOISE_Q = 5;

export type TherapySessionReadinessIssue =
  | 'invalid-frequency'
  | 'invalid-master-gain'
  | 'invalid-white-noise-q'
  | 'am-projection-unconfirmed'
  | 'am-observations-incomplete'
  | 'hearing-correction-unconfirmed';

export interface TherapySessionReadiness {
  readonly ready: boolean;
  readonly issues: readonly TherapySessionReadinessIssue[];
}

export type TherapySessionChange =
  | { readonly type: 'set-frequency'; readonly frequencyHz: number }
  | { readonly type: 'set-tinnitus-type'; readonly value: TinnitusType }
  | {
      readonly type: 'set-audibility';
      readonly frequencyHz: number;
      readonly value: Audibility;
    }
  | { readonly type: 'set-master-gain'; readonly value: number }
  | { readonly type: 'select-filter'; readonly filterId: TherapyFilterId }
  | { readonly type: 'set-white-noise-q'; readonly value: number }
  | {
      readonly type: 'set-hearing-correction';
      readonly value: HearingCorrectionId;
    }
  | { readonly type: 'confirm-am-projection' };

function isFiniteNumberInRange(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function createUnknownAudibilityObservations(): Readonly<
  Record<string, Audibility>
> {
  return Object.fromEntries(
    AM_MATCH_FREQUENCIES_HZ.map(frequencyHz => [frequencyHz, 'unknown']),
  );
}

export function createDefaultTherapySession(): TherapySession {
  return {
    tinnitusMatch: {
      frequencyHz: 3000,
      type: 'tone',
      audibilityByFrequencyHz: createUnknownAudibilityObservations(),
    },
    masterGain: 0.1,
    selectedFilterId: 'white-noise',
    filterSettings: {
      'white-noise': { q: 1 },
      'decorrelating-am': {
        hearingCorrection: null,
        confirmedProjectionHz: null,
      },
    },
  };
}

export function getNearestAMProjectionHz(frequencyHz: number): number {
  if (
    !isFiniteNumberInRange(
      frequencyHz,
      MIN_TINNITUS_FREQUENCY_HZ,
      MAX_TINNITUS_FREQUENCY_HZ,
    )
  ) {
    throw new RangeError(
      `Tinnitus Frequency must be between ${MIN_TINNITUS_FREQUENCY_HZ} and ${MAX_TINNITUS_FREQUENCY_HZ} Hz`,
    );
  }

  let nearest: number = AM_MATCH_FREQUENCIES_HZ[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of AM_MATCH_FREQUENCIES_HZ) {
    const distance = Math.abs(candidate - frequencyHz);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function applySessionChange(
  session: TherapySession,
  change: TherapySessionChange,
): TherapySession {
  switch (change.type) {
    case 'set-frequency': {
      if (
        !isFiniteNumberInRange(
          change.frequencyHz,
          MIN_TINNITUS_FREQUENCY_HZ,
          MAX_TINNITUS_FREQUENCY_HZ,
        )
      ) {
        throw new RangeError(
          `Tinnitus Frequency must be between ${MIN_TINNITUS_FREQUENCY_HZ} and ${MAX_TINNITUS_FREQUENCY_HZ} Hz`,
        );
      }
      return {
        ...session,
        tinnitusMatch: {
          ...session.tinnitusMatch,
          frequencyHz: change.frequencyHz,
        },
      };
    }
    case 'set-tinnitus-type':
      return {
        ...session,
        tinnitusMatch: { ...session.tinnitusMatch, type: change.value },
      };
    case 'set-audibility': {
      if (
        !AM_MATCH_FREQUENCIES_HZ.includes(
          change.frequencyHz as (typeof AM_MATCH_FREQUENCIES_HZ)[number],
        )
      ) {
        throw new RangeError(
          'Audibility can only be recorded at an AM match frequency',
        );
      }
      return {
        ...session,
        tinnitusMatch: {
          ...session.tinnitusMatch,
          audibilityByFrequencyHz: {
            ...session.tinnitusMatch.audibilityByFrequencyHz,
            [change.frequencyHz]: change.value,
          },
        },
      };
    }
    case 'set-master-gain': {
      if (!isFiniteNumberInRange(change.value, 0, 1)) {
        throw new RangeError('Master gain must be between 0 and 1');
      }
      return { ...session, masterGain: change.value };
    }
    case 'select-filter':
      return { ...session, selectedFilterId: change.filterId };
    case 'set-white-noise-q': {
      if (
        !isFiniteNumberInRange(
          change.value,
          MIN_WHITE_NOISE_Q,
          MAX_WHITE_NOISE_Q,
        )
      ) {
        throw new RangeError(
          `White Noise Q must be between ${MIN_WHITE_NOISE_Q} and ${MAX_WHITE_NOISE_Q}`,
        );
      }
      return {
        ...session,
        filterSettings: {
          ...session.filterSettings,
          'white-noise': { q: change.value },
        },
      };
    }
    case 'set-hearing-correction':
      return {
        ...session,
        filterSettings: {
          ...session.filterSettings,
          'decorrelating-am': {
            ...session.filterSettings['decorrelating-am'],
            hearingCorrection: change.value,
          },
        },
      };
    case 'confirm-am-projection':
      return {
        ...session,
        filterSettings: {
          ...session.filterSettings,
          'decorrelating-am': {
            ...session.filterSettings['decorrelating-am'],
            confirmedProjectionHz: getNearestAMProjectionHz(
              session.tinnitusMatch.frequencyHz,
            ),
          },
        },
      };
  }
}

export function getTherapySessionReadiness(
  session: TherapySession,
): TherapySessionReadiness {
  const issues: TherapySessionReadinessIssue[] = [];

  const frequencyIsValid = isFiniteNumberInRange(
    session.tinnitusMatch.frequencyHz,
    MIN_TINNITUS_FREQUENCY_HZ,
    MAX_TINNITUS_FREQUENCY_HZ,
  );
  if (!frequencyIsValid) {
    issues.push('invalid-frequency');
  }
  if (!isFiniteNumberInRange(session.masterGain, 0, 1)) {
    issues.push('invalid-master-gain');
  }

  if (session.selectedFilterId === 'white-noise') {
    if (
      !isFiniteNumberInRange(
        session.filterSettings['white-noise'].q,
        MIN_WHITE_NOISE_Q,
        MAX_WHITE_NOISE_Q,
      )
    ) {
      issues.push('invalid-white-noise-q');
    }
  } else if (
    !frequencyIsValid ||
    session.filterSettings['decorrelating-am'].confirmedProjectionHz !==
      getNearestAMProjectionHz(session.tinnitusMatch.frequencyHz)
  ) {
    issues.push('am-projection-unconfirmed');
  }

  if (
    session.selectedFilterId === 'decorrelating-am' &&
    AM_MATCH_FREQUENCIES_HZ.some(frequencyHz => {
      const value =
        session.tinnitusMatch.audibilityByFrequencyHz[String(frequencyHz)];
      return value !== 'audible' && value !== 'inaudible';
    })
  ) {
    issues.push('am-observations-incomplete');
  }
  if (
    session.selectedFilterId === 'decorrelating-am' &&
    session.filterSettings['decorrelating-am'].hearingCorrection === null
  ) {
    issues.push('hearing-correction-unconfirmed');
  }

  return { ready: issues.length === 0, issues };
}
