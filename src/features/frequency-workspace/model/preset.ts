import type { TherapyPreset, TherapySession, TinnitusMatch } from './types';
import { getTherapySessionReadiness } from './session';

export interface CreateTherapyPresetInput {
  readonly id: string;
  readonly name: string;
  readonly now: number;
  readonly session: TherapySession;
  readonly existingPresets?: readonly TherapyPreset[];
}

function cloneTinnitusMatch(match: TinnitusMatch): TinnitusMatch {
  return {
    ...match,
    audibilityByFrequencyHz: { ...match.audibilityByFrequencyHz },
  };
}

export function normalizeTherapyPresetName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 60) {
    throw new RangeError(
      'Therapy Preset name must contain between 1 and 60 characters',
    );
  }
  return normalized;
}

function assertNameIsAvailable(
  name: string,
  existingPresets: readonly TherapyPreset[],
  excludedId?: string,
) {
  const collision = existingPresets.some(
    preset =>
      preset.id !== excludedId &&
      preset.name.localeCompare(name, undefined, { sensitivity: 'accent' }) ===
        0,
  );
  if (collision) {
    throw new Error(`A Therapy Preset named "${name}" already exists`);
  }
}

function assertSessionIsReady(session: TherapySession) {
  const readiness = getTherapySessionReadiness(session);
  if (!readiness.ready) {
    throw new Error(
      `Therapy Session is not ready: ${readiness.issues.join(', ')}`,
    );
  }
}

function snapshotSession(
  session: TherapySession,
  metadata: Pick<TherapyPreset, 'id' | 'name' | 'createdAt' | 'updatedAt'>,
): TherapyPreset {
  const base = {
    ...metadata,
    tinnitusMatch: cloneTinnitusMatch(session.tinnitusMatch),
    masterGain: session.masterGain,
  };

  if (session.selectedFilterId === 'white-noise') {
    return {
      ...base,
      filterId: 'white-noise',
      filterSettings: { ...session.filterSettings['white-noise'] },
    };
  }

  return {
    ...base,
    filterId: 'decorrelating-am',
    filterSettings: { ...session.filterSettings['decorrelating-am'] },
  };
}

export function createTherapyPreset(
  input: CreateTherapyPresetInput,
): TherapyPreset {
  assertSessionIsReady(input.session);
  const name = normalizeTherapyPresetName(input.name);
  assertNameIsAvailable(name, input.existingPresets ?? []);

  return snapshotSession(input.session, {
    id: input.id,
    name,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function replaceTherapyPresetSnapshot(
  preset: TherapyPreset,
  session: TherapySession,
  now: number,
): TherapyPreset {
  if (preset.filterId !== session.selectedFilterId) {
    throw new Error(
      'A preset can only be updated for its existing Therapy Filter',
    );
  }
  assertSessionIsReady(session);

  return snapshotSession(session, {
    id: preset.id,
    name: preset.name,
    createdAt: preset.createdAt,
    updatedAt: now,
  });
}

export function renameTherapyPreset(
  preset: TherapyPreset,
  name: string,
  now: number,
  existingPresets: readonly TherapyPreset[],
): TherapyPreset {
  const normalizedName = normalizeTherapyPresetName(name);
  assertNameIsAvailable(normalizedName, existingPresets, preset.id);
  return { ...preset, name: normalizedName, updatedAt: now };
}

export function applyTherapyPreset(
  current: TherapySession,
  preset: TherapyPreset,
): TherapySession {
  if (preset.filterId === 'white-noise') {
    return {
      ...current,
      tinnitusMatch: {
        ...current.tinnitusMatch,
        frequencyHz: preset.tinnitusMatch.frequencyHz,
        type: preset.tinnitusMatch.type,
      },
      masterGain: preset.masterGain,
      selectedFilterId: 'white-noise',
      filterSettings: {
        ...current.filterSettings,
        'white-noise': { ...preset.filterSettings },
      },
    };
  }

  return {
    ...current,
    tinnitusMatch: cloneTinnitusMatch(preset.tinnitusMatch),
    masterGain: preset.masterGain,
    selectedFilterId: 'decorrelating-am',
    filterSettings: {
      ...current.filterSettings,
      'decorrelating-am': { ...preset.filterSettings },
    },
  };
}

export function isSessionDirtyForPreset(
  session: TherapySession,
  preset: TherapyPreset,
): boolean {
  if (session.selectedFilterId !== preset.filterId) {
    return true;
  }
  if (
    session.tinnitusMatch.frequencyHz !== preset.tinnitusMatch.frequencyHz ||
    session.tinnitusMatch.type !== preset.tinnitusMatch.type ||
    session.masterGain !== preset.masterGain
  ) {
    return true;
  }
  if (preset.filterId === 'white-noise') {
    return session.filterSettings['white-noise'].q !== preset.filterSettings.q;
  }
  const settings = session.filterSettings['decorrelating-am'];
  return (
    settings.hearingCorrection !== preset.filterSettings.hearingCorrection ||
    settings.confirmedProjectionHz !==
      preset.filterSettings.confirmedProjectionHz ||
    Object.keys(preset.tinnitusMatch.audibilityByFrequencyHz).some(
      frequencyHz =>
        session.tinnitusMatch.audibilityByFrequencyHz[frequencyHz] !==
        preset.tinnitusMatch.audibilityByFrequencyHz[frequencyHz],
    )
  );
}

export function sortTherapyPresets(
  presets: readonly TherapyPreset[],
): TherapyPreset[] {
  return [...presets].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
  );
}
