import { describe, expect, it } from 'vitest';

import {
  AM_MATCH_FREQUENCIES_HZ,
  applySessionChange,
  createDefaultTherapySession,
  getNearestAMProjectionHz,
  getTherapySessionReadiness,
} from './session';

describe('Therapy Session', () => {
  it('starts with the agreed White Noise configuration and unknown AM observations', () => {
    const session = createDefaultTherapySession();

    expect(session).toEqual({
      tinnitusMatch: {
        frequencyHz: 3000,
        type: 'tone',
        audibilityByFrequencyHz: Object.fromEntries(
          AM_MATCH_FREQUENCIES_HZ.map(frequencyHz => [frequencyHz, 'unknown']),
        ),
      },
      masterGain: 0.1,
      selectedFilterId: 'white-noise',
      filterSettings: {
        'white-noise': { q: 1 },
        'decorrelating-am': {
          hearingCorrection: null,
          confirmedProjectionHz: null,
        },
        'cr-neuromodulation': {
          notchedNoise: false,
          noiseLevel: 0.3,
          notchQ: 1,
        },
      },
    });
    expect(getTherapySessionReadiness(session)).toEqual({
      ready: true,
      issues: [],
    });
  });

  it('preserves each filter configuration while selecting another filter', () => {
    const original = createDefaultTherapySession();
    const withWhiteNoiseQ = applySessionChange(original, {
      type: 'set-white-noise-q',
      value: 2.5,
    });
    const withAMSelected = applySessionChange(withWhiteNoiseQ, {
      type: 'select-filter',
      filterId: 'decorrelating-am',
    });

    expect(withAMSelected.selectedFilterId).toBe('decorrelating-am');
    expect(withAMSelected.filterSettings['white-noise'].q).toBe(2.5);
    expect(original.filterSettings['white-noise'].q).toBe(1);
  });

  it('requires confirmation when an AM frequency projects to another supported frequency', () => {
    expect(getNearestAMProjectionHz(3000)).toBe(2800);
    expect(getNearestAMProjectionHz(3100)).toBe(2800);
    expect(getNearestAMProjectionHz(16_001)).toBe(16_000);

    const session = applySessionChange(createDefaultTherapySession(), {
      type: 'select-filter',
      filterId: 'decorrelating-am',
    });

    expect(getTherapySessionReadiness(session)).toEqual({
      ready: false,
      issues: [
        'am-projection-unconfirmed',
        'am-observations-incomplete',
        'hearing-correction-unconfirmed',
      ],
    });
  });

  it('becomes AM-ready only after observations, Hearing Correction, and projection confirmation', () => {
    let session = applySessionChange(createDefaultTherapySession(), {
      type: 'select-filter',
      filterId: 'decorrelating-am',
    });
    for (const frequencyHz of AM_MATCH_FREQUENCIES_HZ) {
      session = applySessionChange(session, {
        type: 'set-audibility',
        frequencyHz,
        value: 'audible',
      });
    }
    session = applySessionChange(session, {
      type: 'set-hearing-correction',
      value: 'a2',
    });
    session = applySessionChange(session, { type: 'confirm-am-projection' });

    expect(session.filterSettings['decorrelating-am']).toEqual({
      hearingCorrection: 'a2',
      confirmedProjectionHz: 2800,
    });
    expect(getTherapySessionReadiness(session)).toEqual({
      ready: true,
      issues: [],
    });
  });

  it('reports an invalid restored AM frequency without throwing', () => {
    const session = {
      ...createDefaultTherapySession(),
      selectedFilterId: 'decorrelating-am' as const,
      tinnitusMatch: {
        ...createDefaultTherapySession().tinnitusMatch,
        frequencyHz: Number.NaN,
      },
    };

    expect(getTherapySessionReadiness(session)).toMatchObject({
      ready: false,
      issues: expect.arrayContaining(['invalid-frequency']),
    });
  });

  it('rejects invalid domain changes instead of clamping or corrupting the session', () => {
    const session = createDefaultTherapySession();

    expect(() =>
      applySessionChange(session, { type: 'set-frequency', frequencyHz: 0 }),
    ).toThrowError('Tinnitus Frequency must be between 1 and 22000 Hz');
    expect(() =>
      applySessionChange(session, { type: 'set-master-gain', value: 1.1 }),
    ).toThrowError('Master gain must be between 0 and 1');
    expect(() =>
      applySessionChange(session, { type: 'set-white-noise-q', value: 0 }),
    ).toThrowError('White Noise Q must be between 0.1 and 5');
    expect(session).toEqual(createDefaultTherapySession());
  });

  it('starts CR Neuromodulation only for a frequency from 500 to 10 000 Hz', () => {
    const cr = applySessionChange(createDefaultTherapySession(), {
      type: 'select-filter',
      filterId: 'cr-neuromodulation',
    });
    const at = (frequencyHz: number) =>
      getTherapySessionReadiness(
        applySessionChange(cr, { type: 'set-frequency', frequencyHz }),
      );

    expect(at(500)).toEqual({ ready: true, issues: [] });
    expect(at(10_000)).toEqual({ ready: true, issues: [] });
    expect(at(499)).toEqual({
      ready: false,
      issues: ['cr-frequency-out-of-range'],
    });
    expect(at(10_001).issues).toEqual(['cr-frequency-out-of-range']);
  });

  it('keeps the CR noise mix in range and leaves White Noise alone', () => {
    const session = createDefaultTherapySession();
    const mixed = applySessionChange(
      applySessionChange(
        applySessionChange(session, {
          type: 'set-cr-notched-noise',
          value: true,
        }),
        { type: 'set-cr-noise-level', value: 0.5 },
      ),
      { type: 'set-cr-notch-q', value: 2 },
    );

    expect(mixed.filterSettings['cr-neuromodulation']).toEqual({
      notchedNoise: true,
      noiseLevel: 0.5,
      notchQ: 2,
    });
    expect(mixed.filterSettings['white-noise']).toEqual({ q: 1 });
    expect(() =>
      applySessionChange(session, { type: 'set-cr-noise-level', value: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      applySessionChange(session, { type: 'set-cr-notch-q', value: 6 }),
    ).toThrow(RangeError);
  });
});
