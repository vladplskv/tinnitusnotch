import { describe, expect, it } from 'vitest';

import {
  applyTherapyPreset,
  createTherapyPreset,
  isSessionDirtyForPreset,
  normalizeTherapyPresetName,
  renameTherapyPreset,
  replaceTherapyPresetSnapshot,
  sortTherapyPresets,
} from './preset';
import {
  AM_MATCH_FREQUENCIES_HZ,
  applySessionChange,
  createDefaultTherapySession,
} from './session';

describe('Therapy Presets', () => {
  it('creates an independent ready-to-start White Noise snapshot with a trimmed name', () => {
    const session = applySessionChange(createDefaultTherapySession(), {
      type: 'set-white-noise-q',
      value: 2,
    });
    const preset = createTherapyPreset({
      id: 'preset-1',
      name: '  Evening  ',
      now: 123,
      session,
    });

    expect(preset).toMatchObject({
      id: 'preset-1',
      name: 'Evening',
      createdAt: 123,
      updatedAt: 123,
      filterId: 'white-noise',
      filterSettings: { q: 2 },
    });

    const edited = applySessionChange(session, {
      type: 'set-white-noise-q',
      value: 3,
    });
    expect(edited.filterSettings['white-noise'].q).toBe(3);
    expect(preset.filterId).toBe('white-noise');
    if (preset.filterId !== 'white-noise')
      throw new Error('expected White Noise');
    expect(preset.filterSettings.q).toBe(2);
  });

  it('loads White Noise shared fields without erasing retained AM matching data', () => {
    const saved = applySessionChange(createDefaultTherapySession(), {
      type: 'set-frequency',
      frequencyHz: 5000,
    });
    const preset = createTherapyPreset({
      id: 'white',
      name: 'White',
      now: 1,
      session: saved,
    });

    let current = createDefaultTherapySession();
    current = applySessionChange(current, {
      type: 'set-audibility',
      frequencyHz: AM_MATCH_FREQUENCIES_HZ[0],
      value: 'audible',
    });
    current = applySessionChange(current, {
      type: 'set-hearing-correction',
      value: 'c2',
    });

    const loaded = applyTherapyPreset(current, preset);

    expect(loaded.tinnitusMatch.frequencyHz).toBe(5000);
    expect(loaded.tinnitusMatch.audibilityByFrequencyHz['1000']).toBe(
      'audible',
    );
    expect(loaded.filterSettings['decorrelating-am'].hearingCorrection).toBe(
      'c2',
    );
  });

  it('refuses to save an AM snapshot until it is ready to start', () => {
    const session = applySessionChange(createDefaultTherapySession(), {
      type: 'select-filter',
      filterId: 'decorrelating-am',
    });

    expect(() =>
      createTherapyPreset({ id: 'am', name: 'AM', now: 1, session }),
    ).toThrowError(
      'Therapy Session is not ready: am-projection-unconfirmed, am-observations-incomplete, hearing-correction-unconfirmed',
    );
  });

  it('compares only the canonical fields captured by the loaded preset', () => {
    const session = createDefaultTherapySession();
    const preset = createTherapyPreset({
      id: 'white',
      name: 'White',
      now: 1,
      session,
    });

    const unrelatedAMEdit = applySessionChange(session, {
      type: 'set-hearing-correction',
      value: 'c1',
    });
    expect(isSessionDirtyForPreset(unrelatedAMEdit, preset)).toBe(false);

    const capturedEdit = applySessionChange(unrelatedAMEdit, {
      type: 'set-master-gain',
      value: 0.2,
    });
    expect(isSessionDirtyForPreset(capturedEdit, preset)).toBe(true);
  });

  it('normalizes names, detects case-insensitive collisions, and sorts deterministically', () => {
    expect(normalizeTherapyPresetName('  Focus  ')).toBe('Focus');
    expect(() => normalizeTherapyPresetName(' '.repeat(3))).toThrowError(
      'Therapy Preset name must contain between 1 and 60 characters',
    );
    expect(() => normalizeTherapyPresetName('a'.repeat(61))).toThrowError(
      'Therapy Preset name must contain between 1 and 60 characters',
    );

    const first = createTherapyPreset({
      id: 'b',
      name: 'Focus',
      now: 10,
      session: createDefaultTherapySession(),
    });
    expect(() =>
      createTherapyPreset({
        id: 'other',
        name: ' focus ',
        now: 11,
        session: createDefaultTherapySession(),
        existingPresets: [first],
      }),
    ).toThrowError('A Therapy Preset named "focus" already exists');

    const sameTimeA = { ...first, id: 'a' };
    expect(
      sortTherapyPresets([first, sameTimeA]).map(preset => preset.id),
    ).toEqual(['a', 'b']);
  });

  it('renames metadata and explicitly replaces a same-filter snapshot', () => {
    const session = createDefaultTherapySession();
    const original = createTherapyPreset({
      id: 'same-id',
      name: 'Original',
      now: 10,
      session,
    });
    const renamed = renameTherapyPreset(original, ' Renamed ', 20, [original]);
    expect(renamed).toMatchObject({
      id: 'same-id',
      name: 'Renamed',
      createdAt: 10,
      updatedAt: 20,
      filterSettings: { q: 1 },
    });

    const edited = applySessionChange(session, {
      type: 'set-white-noise-q',
      value: 4,
    });
    const replaced = replaceTherapyPresetSnapshot(renamed, edited, 30);
    expect(replaced).toMatchObject({
      id: 'same-id',
      name: 'Renamed',
      createdAt: 10,
      updatedAt: 30,
      filterSettings: { q: 4 },
    });
  });

  it('saves and loads a CR Neuromodulation preset with its noise mix', () => {
    const session = applySessionChange(
      applySessionChange(
        applySessionChange(createDefaultTherapySession(), {
          type: 'select-filter',
          filterId: 'cr-neuromodulation',
        }),
        { type: 'set-frequency', frequencyHz: 6_000 },
      ),
      { type: 'set-cr-notched-noise', value: true },
    );
    const preset = createTherapyPreset({
      id: 'cr-1',
      name: 'CR',
      now: 1,
      session,
    });

    expect(preset).toMatchObject({
      filterId: 'cr-neuromodulation',
      filterSettings: { notchedNoise: true, noiseLevel: 0.3, notchQ: 1 },
      tinnitusMatch: { frequencyHz: 6_000 },
    });

    const elsewhere = applySessionChange(createDefaultTherapySession(), {
      type: 'set-frequency',
      frequencyHz: 2_000,
    });
    const loaded = applyTherapyPreset(elsewhere, preset);
    expect(loaded.selectedFilterId).toBe('cr-neuromodulation');
    expect(loaded.tinnitusMatch.frequencyHz).toBe(6_000);
    expect(loaded.filterSettings['cr-neuromodulation'].notchedNoise).toBe(true);
    expect(
      isSessionDirtyForPreset(
        applySessionChange(loaded, { type: 'set-cr-notch-q', value: 2 }),
        preset,
      ),
    ).toBe(true);
    expect(isSessionDirtyForPreset(loaded, preset)).toBe(false);
    expect(
      isSessionDirtyForPreset(
        applySessionChange(loaded, {
          type: 'set-frequency',
          frequencyHz: 6_100,
        }),
        preset,
      ),
    ).toBe(true);
    expect(() =>
      createTherapyPreset({
        id: 'cr-2',
        name: 'Too low',
        now: 1,
        session: applySessionChange(session, {
          type: 'set-frequency',
          frequencyHz: 400,
        }),
      }),
    ).toThrow('cr-frequency-out-of-range');
  });
});
