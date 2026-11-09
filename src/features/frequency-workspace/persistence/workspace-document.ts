import {
  AM_MATCH_FREQUENCIES_HZ,
  MAX_TINNITUS_FREQUENCY_HZ,
  MAX_WHITE_NOISE_Q,
  MIN_TINNITUS_FREQUENCY_HZ,
  MIN_WHITE_NOISE_Q,
  createDefaultTherapySession,
  getNearestAMProjectionHz,
  isValidCRNoise,
} from '../model/session';
import {
  MAX_CR_NOISE_LEVEL,
  MIN_CR_NOISE_LEVEL,
  isCRTinnitusFrequency,
} from '../model/cr-neuromodulation';
import type {
  Audibility,
  HearingCorrectionId,
  TherapyPreset,
  TherapySession,
  TinnitusType,
} from '../model/types';

export const WORKSPACE_SCHEMA_VERSION = 1;
export const SESSION_SCHEMA_VERSION = 1;
export const FILTER_SETTINGS_SCHEMA_VERSION = 1;
export const PRESET_SCHEMA_VERSION = 1;

interface AvailableDocumentPreset {
  readonly kind: 'available';
  readonly preset: TherapyPreset;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly sourceIndex: number;
}

interface UnavailableDocumentPreset {
  readonly kind: 'unavailable';
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly reason: 'unknown-filter' | 'newer-version' | 'invalid-data';
  readonly raw: unknown;
  readonly sourceIndex: number;
}

export type WorkspaceDocumentPreset =
  | AvailableDocumentPreset
  | UnavailableDocumentPreset;

export type WorkspaceDocumentPresetEntry =
  | { readonly kind: 'available'; readonly preset: TherapyPreset }
  | {
      readonly kind: 'unavailable';
      readonly id: string;
      readonly name: string;
      readonly updatedAt: number;
      readonly reason: 'unknown-filter' | 'newer-version' | 'invalid-data';
    };

interface PreservedWorkspaceRaw {
  readonly root: Readonly<Record<string, unknown>>;
  readonly session: Readonly<Record<string, unknown>>;
  readonly sessionIsOpaque: boolean;
  readonly tinnitusMatch: Readonly<Record<string, unknown>>;
  readonly audibility: Readonly<Record<string, unknown>>;
  readonly filterSettings: Readonly<Record<string, unknown>>;
  readonly whiteNoise: Readonly<Record<string, unknown>>;
  readonly whiteNoiseIsOpaque: boolean;
  readonly decorrelatingAM: Readonly<Record<string, unknown>>;
  readonly decorrelatingAMIsOpaque: boolean;
  readonly crNeuromodulation: Readonly<Record<string, unknown>>;
  readonly crNeuromodulationIsOpaque: boolean;
}

export interface WorkspaceDocument {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly session: TherapySession;
  readonly presetEntries: readonly WorkspaceDocumentPreset[];
  readonly loadedPresetId: string | null;
  readonly preservedRaw: PreservedWorkspaceRaw;
}

export type WorkspaceDocumentRecoveryReason =
  | 'malformed-json'
  | 'invalid-envelope'
  | 'newer-version';

export type WorkspaceDocumentDecodeResult =
  | {
      readonly kind: 'decoded';
      readonly document: WorkspaceDocument;
      readonly repairedFields: readonly string[];
    }
  | {
      readonly kind: 'recovery';
      readonly reason: WorkspaceDocumentRecoveryReason;
      readonly rawValue: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyPreservedRaw(): PreservedWorkspaceRaw {
  return {
    root: {},
    session: {},
    sessionIsOpaque: false,
    tinnitusMatch: {},
    audibility: {},
    filterSettings: {},
    whiteNoise: {},
    whiteNoiseIsOpaque: false,
    decorrelatingAM: {},
    decorrelatingAMIsOpaque: false,
    crNeuromodulation: {},
    crNeuromodulationIsOpaque: false,
  };
}

export function createInitialWorkspaceDocument(): WorkspaceDocument {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    revision: 1,
    session: createDefaultTherapySession(),
    presetEntries: [],
    loadedPresetId: null,
    preservedRaw: createEmptyPreservedRaw(),
  };
}

export interface WorkspaceDocumentUpdate {
  readonly session?: TherapySession;
  readonly availablePresets?: readonly TherapyPreset[];
  readonly loadedPresetId?: string | null;
}

export function updateWorkspaceDocument(
  document: WorkspaceDocument,
  update: WorkspaceDocumentUpdate,
): WorkspaceDocument {
  let presetEntries = document.presetEntries;
  if (update.availablePresets !== undefined) {
    const ids = new Set<string>();
    for (const preset of update.availablePresets) {
      if (ids.has(preset.id)) {
        throw new Error(`Duplicate Therapy Preset id: ${preset.id}`);
      }
      ids.add(preset.id);
    }

    const existingAvailable = new Map(
      document.presetEntries
        .filter(
          (entry): entry is AvailableDocumentPreset =>
            entry.kind === 'available',
        )
        .map(entry => [entry.preset.id, entry]),
    );
    let nextSourceIndex =
      Math.max(-1, ...document.presetEntries.map(entry => entry.sourceIndex)) +
      1;
    const availableEntries = update.availablePresets.map(preset => {
      const existing = existingAvailable.get(preset.id);
      if (existing !== undefined) {
        return { ...existing, preset };
      }
      return {
        kind: 'available' as const,
        preset,
        raw: {},
        sourceIndex: nextSourceIndex++,
      };
    });
    presetEntries = [
      ...document.presetEntries.filter(entry => entry.kind === 'unavailable'),
      ...availableEntries,
    ];
  }

  const requestedLoadedPresetId =
    update.loadedPresetId === undefined
      ? document.loadedPresetId
      : update.loadedPresetId;
  const loadedPresetId =
    requestedLoadedPresetId !== null &&
    presetEntries.some(
      entry =>
        entry.kind === 'available' &&
        entry.preset.id === requestedLoadedPresetId,
    )
      ? requestedLoadedPresetId
      : null;

  return {
    ...document,
    revision: document.revision + 1,
    session: update.session ?? document.session,
    presetEntries,
    loadedPresetId,
  };
}

function getDocumentPresetId(entry: WorkspaceDocumentPreset): string {
  return entry.kind === 'available' ? entry.preset.id : entry.id;
}

export interface RemoveWorkspaceDocumentPresetResult {
  readonly document: WorkspaceDocument;
  readonly removed: WorkspaceDocumentPreset | null;
}

export function removeWorkspaceDocumentPreset(
  document: WorkspaceDocument,
  presetId: string,
): RemoveWorkspaceDocumentPresetResult {
  const removed =
    document.presetEntries.find(
      entry => getDocumentPresetId(entry) === presetId,
    ) ?? null;
  if (removed === null) return { document, removed: null };

  return {
    document: {
      ...document,
      revision: document.revision + 1,
      presetEntries: document.presetEntries.filter(entry => entry !== removed),
      loadedPresetId:
        document.loadedPresetId === presetId ? null : document.loadedPresetId,
    },
    removed,
  };
}

export function restoreWorkspaceDocumentPreset(
  document: WorkspaceDocument,
  preset: WorkspaceDocumentPreset,
): WorkspaceDocument {
  const presetId = getDocumentPresetId(preset);
  if (
    document.presetEntries.some(
      entry => getDocumentPresetId(entry) === presetId,
    )
  ) {
    throw new Error(
      `A persisted Therapy Preset with id ${presetId} already exists`,
    );
  }
  return {
    ...document,
    revision: document.revision + 1,
    presetEntries: [...document.presetEntries, preset],
  };
}

function encodeSession(
  session: TherapySession,
  preserved: PreservedWorkspaceRaw,
): Record<string, unknown> {
  if (preserved.sessionIsOpaque) {
    return cloneJsonValue(preserved.session);
  }
  return {
    ...cloneJsonValue(preserved.session),
    schemaVersion: SESSION_SCHEMA_VERSION,
    tinnitusMatch: {
      ...cloneJsonValue(preserved.tinnitusMatch),
      frequencyHz: session.tinnitusMatch.frequencyHz,
      type: session.tinnitusMatch.type,
      audibilityByFrequencyHz: {
        ...cloneJsonValue(preserved.audibility),
        ...session.tinnitusMatch.audibilityByFrequencyHz,
      },
    },
    masterGain: session.masterGain,
    selectedFilterId: session.selectedFilterId,
    filterSettings: {
      ...cloneJsonValue(preserved.filterSettings),
      'white-noise': preserved.whiteNoiseIsOpaque
        ? cloneJsonValue(preserved.whiteNoise)
        : {
            ...cloneJsonValue(preserved.whiteNoise),
            schemaVersion: FILTER_SETTINGS_SCHEMA_VERSION,
            q: session.filterSettings['white-noise'].q,
          },
      'decorrelating-am': preserved.decorrelatingAMIsOpaque
        ? cloneJsonValue(preserved.decorrelatingAM)
        : {
            ...cloneJsonValue(preserved.decorrelatingAM),
            schemaVersion: FILTER_SETTINGS_SCHEMA_VERSION,
            hearingCorrection:
              session.filterSettings['decorrelating-am'].hearingCorrection,
            confirmedProjectionHz:
              session.filterSettings['decorrelating-am'].confirmedProjectionHz,
          },
      'cr-neuromodulation': preserved.crNeuromodulationIsOpaque
        ? cloneJsonValue(preserved.crNeuromodulation)
        : {
            ...cloneJsonValue(preserved.crNeuromodulation),
            schemaVersion: FILTER_SETTINGS_SCHEMA_VERSION,
            ...session.filterSettings['cr-neuromodulation'],
          },
    },
  };
}

function encodePreset(entry: WorkspaceDocumentPreset): unknown {
  if (entry.kind === 'unavailable') {
    return cloneJsonValue(entry.raw);
  }

  const preset = entry.preset;
  const rawMatch = isRecord(entry.raw.tinnitusMatch)
    ? entry.raw.tinnitusMatch
    : {};
  const rawAudibility = isRecord(rawMatch.audibilityByFrequencyHz)
    ? rawMatch.audibilityByFrequencyHz
    : {};
  return {
    ...cloneJsonValue(entry.raw),
    schemaVersion: PRESET_SCHEMA_VERSION,
    id: preset.id,
    name: preset.name,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
    tinnitusMatch: {
      ...cloneJsonValue(rawMatch),
      frequencyHz: preset.tinnitusMatch.frequencyHz,
      type: preset.tinnitusMatch.type,
      audibilityByFrequencyHz: {
        ...cloneJsonValue(rawAudibility),
        ...preset.tinnitusMatch.audibilityByFrequencyHz,
      },
    },
    masterGain: preset.masterGain,
    filterId: preset.filterId,
    filterSettings: {
      ...(isRecord(entry.raw.filterSettings)
        ? cloneJsonValue(entry.raw.filterSettings)
        : {}),
      ...preset.filterSettings,
      schemaVersion: FILTER_SETTINGS_SCHEMA_VERSION,
    },
  };
}

function getUnavailablePresetMetadata(raw: unknown, sourceIndex: number) {
  const record = isRecord(raw) ? raw : {};
  return {
    id:
      typeof record.id === 'string' && record.id.length > 0
        ? record.id
        : `unavailable-${sourceIndex}`,
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name.trim().slice(0, 60)
        : `Unavailable preset ${sourceIndex + 1}`,
    updatedAt:
      typeof record.updatedAt === 'number' &&
      Number.isFinite(record.updatedAt) &&
      record.updatedAt >= 0
        ? record.updatedAt
        : 0,
  };
}

function unavailablePreset(
  raw: unknown,
  sourceIndex: number,
  reason: UnavailableDocumentPreset['reason'],
): UnavailableDocumentPreset {
  return {
    kind: 'unavailable',
    ...getUnavailablePresetMetadata(raw, sourceIndex),
    reason,
    raw: cloneJsonValue(raw),
    sourceIndex,
  };
}

function parsePresetMatch(raw: unknown): TherapyPreset['tinnitusMatch'] | null {
  if (!isRecord(raw) || !isRecord(raw.audibilityByFrequencyHz)) return null;
  if (
    typeof raw.frequencyHz !== 'number' ||
    !Number.isFinite(raw.frequencyHz) ||
    raw.frequencyHz < MIN_TINNITUS_FREQUENCY_HZ ||
    raw.frequencyHz > MAX_TINNITUS_FREQUENCY_HZ ||
    (raw.type !== 'tone' && raw.type !== 'noise')
  ) {
    return null;
  }

  const audibilityByFrequencyHz: Record<string, Audibility> = {};
  for (const frequencyHz of AM_MATCH_FREQUENCIES_HZ) {
    const key = String(frequencyHz);
    const value = raw.audibilityByFrequencyHz[key];
    if (value !== 'unknown' && value !== 'audible' && value !== 'inaudible') {
      return null;
    }
    audibilityByFrequencyHz[key] = value;
  }

  return {
    frequencyHz: raw.frequencyHz,
    type: raw.type,
    audibilityByFrequencyHz,
  };
}

function parsePreset(
  raw: unknown,
  sourceIndex: number,
): WorkspaceDocumentPreset {
  if (!isRecord(raw))
    return unavailablePreset(raw, sourceIndex, 'invalid-data');
  if (
    typeof raw.schemaVersion === 'number' &&
    raw.schemaVersion > PRESET_SCHEMA_VERSION
  ) {
    return unavailablePreset(raw, sourceIndex, 'newer-version');
  }
  if (
    raw.schemaVersion === PRESET_SCHEMA_VERSION &&
    raw.filterId !== 'white-noise' &&
    raw.filterId !== 'decorrelating-am' &&
    raw.filterId !== 'cr-neuromodulation'
  ) {
    return unavailablePreset(raw, sourceIndex, 'unknown-filter');
  }

  const match = parsePresetMatch(raw.tinnitusMatch);
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const commonIsValid =
    raw.schemaVersion === PRESET_SCHEMA_VERSION &&
    typeof raw.id === 'string' &&
    raw.id.length > 0 &&
    name.length >= 1 &&
    name.length <= 60 &&
    typeof raw.createdAt === 'number' &&
    Number.isFinite(raw.createdAt) &&
    raw.createdAt >= 0 &&
    typeof raw.updatedAt === 'number' &&
    Number.isFinite(raw.updatedAt) &&
    raw.updatedAt >= 0 &&
    typeof raw.masterGain === 'number' &&
    Number.isFinite(raw.masterGain) &&
    raw.masterGain >= 0 &&
    raw.masterGain <= 1 &&
    match !== null &&
    isRecord(raw.filterSettings) &&
    raw.filterSettings.schemaVersion === FILTER_SETTINGS_SCHEMA_VERSION;

  if (!commonIsValid || match === null || !isRecord(raw.filterSettings)) {
    return unavailablePreset(raw, sourceIndex, 'invalid-data');
  }

  const base = {
    id: raw.id as string,
    name,
    createdAt: raw.createdAt as number,
    updatedAt: raw.updatedAt as number,
    tinnitusMatch: match,
    masterGain: raw.masterGain as number,
  };

  let preset: TherapyPreset;
  if (
    raw.filterId === 'white-noise' &&
    typeof raw.filterSettings.q === 'number' &&
    Number.isFinite(raw.filterSettings.q) &&
    raw.filterSettings.q >= MIN_WHITE_NOISE_Q &&
    raw.filterSettings.q <= MAX_WHITE_NOISE_Q
  ) {
    preset = {
      ...base,
      filterId: 'white-noise',
      filterSettings: { q: raw.filterSettings.q },
    };
  } else if (
    raw.filterId === 'cr-neuromodulation' &&
    isCRTinnitusFrequency(match.frequencyHz) &&
    typeof raw.filterSettings.notchedNoise === 'boolean' &&
    isValidCRNoise(raw.filterSettings.noiseLevel, raw.filterSettings.notchQ)
  ) {
    preset = {
      ...base,
      filterId: 'cr-neuromodulation',
      filterSettings: {
        notchedNoise: raw.filterSettings.notchedNoise,
        noiseLevel: raw.filterSettings.noiseLevel as number,
        notchQ: raw.filterSettings.notchQ as number,
      },
    };
  } else if (raw.filterId === 'decorrelating-am') {
    const correction = raw.filterSettings.hearingCorrection;
    const projection = raw.filterSettings.confirmedProjectionHz;
    const observationsComplete = AM_MATCH_FREQUENCIES_HZ.every(
      frequencyHz =>
        match.audibilityByFrequencyHz[String(frequencyHz)] !== 'unknown',
    );
    if (
      (correction === 'a1' ||
        correction === 'a2' ||
        correction === 'c1' ||
        correction === 'c2') &&
      projection === getNearestAMProjectionHz(match.frequencyHz) &&
      observationsComplete
    ) {
      preset = {
        ...base,
        filterId: 'decorrelating-am',
        filterSettings: {
          hearingCorrection: correction,
          confirmedProjectionHz: projection,
        },
      };
    } else {
      return unavailablePreset(raw, sourceIndex, 'invalid-data');
    }
  } else {
    return unavailablePreset(raw, sourceIndex, 'invalid-data');
  }

  return {
    kind: 'available',
    preset,
    raw: cloneJsonValue(raw),
    sourceIndex,
  };
}

export function encodeWorkspaceDocument(document: WorkspaceDocument): string {
  const presets = [...document.presetEntries]
    .sort((left, right) => left.sourceIndex - right.sourceIndex)
    .map(encodePreset);

  return JSON.stringify({
    ...cloneJsonValue(document.preservedRaw.root),
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    revision: document.revision,
    session: encodeSession(document.session, document.preservedRaw),
    presets,
    loadedPresetId: document.loadedPresetId,
  });
}

export function decodeWorkspaceDocument(
  rawValue: string,
): WorkspaceDocumentDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return { kind: 'recovery', reason: 'malformed-json', rawValue };
  }

  if (!isRecord(parsed)) {
    return { kind: 'recovery', reason: 'invalid-envelope', rawValue };
  }
  if (
    typeof parsed.schemaVersion === 'number' &&
    parsed.schemaVersion > WORKSPACE_SCHEMA_VERSION
  ) {
    return { kind: 'recovery', reason: 'newer-version', rawValue };
  }
  if (
    typeof parsed.revision !== 'number' ||
    !Number.isInteger(parsed.revision) ||
    parsed.revision < 1
  ) {
    return { kind: 'recovery', reason: 'invalid-envelope', rawValue };
  }
  if (
    parsed.schemaVersion !== WORKSPACE_SCHEMA_VERSION ||
    !isRecord(parsed.session)
  ) {
    return { kind: 'recovery', reason: 'invalid-envelope', rawValue };
  }

  const defaultSession = createDefaultTherapySession();
  const rawSession = parsed.session;
  const rawMatch = isRecord(rawSession.tinnitusMatch)
    ? rawSession.tinnitusMatch
    : {};
  const rawFilterSettings = isRecord(rawSession.filterSettings)
    ? rawSession.filterSettings
    : {};
  const rawWhiteNoise = isRecord(rawFilterSettings['white-noise'])
    ? rawFilterSettings['white-noise']
    : {};
  const rawDecorrelatingAM = isRecord(rawFilterSettings['decorrelating-am'])
    ? rawFilterSettings['decorrelating-am']
    : {};
  /*
   * CR came after the first stored documents. Its missing entry takes the
   * defaults quietly; only a stored entry that is wrong counts as a repair.
   */
  const crNeuromodulationStored = isRecord(
    rawFilterSettings['cr-neuromodulation'],
  );
  const rawCRNeuromodulation = crNeuromodulationStored
    ? (rawFilterSettings['cr-neuromodulation'] as Record<string, unknown>)
    : {};
  const repairCR = (field: string) => {
    if (crNeuromodulationStored) {
      repair(`session.filterSettings.cr-neuromodulation.${field}`);
    }
  };
  const rawAudibility = isRecord(rawMatch.audibilityByFrequencyHz)
    ? rawMatch.audibilityByFrequencyHz
    : {};

  const repairedFields: string[] = [];
  const repair = (field: string) => {
    if (!repairedFields.includes(field)) repairedFields.push(field);
  };
  const isFiniteInRange = (value: unknown, minimum: number, maximum: number) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum;

  const sessionSchemaSupported =
    rawSession.schemaVersion === SESSION_SCHEMA_VERSION;
  const sessionIsOpaque =
    typeof rawSession.schemaVersion === 'number' &&
    rawSession.schemaVersion > SESSION_SCHEMA_VERSION;
  if (!sessionSchemaSupported) repair('session.schemaVersion');
  const readableMatch = sessionSchemaSupported ? rawMatch : {};
  const readableAudibility = sessionSchemaSupported ? rawAudibility : {};
  const readableSession = sessionSchemaSupported ? rawSession : {};
  const whiteNoiseSchemaSupported =
    sessionSchemaSupported &&
    rawWhiteNoise.schemaVersion === FILTER_SETTINGS_SCHEMA_VERSION;
  const whiteNoiseIsOpaque =
    typeof rawWhiteNoise.schemaVersion === 'number' &&
    rawWhiteNoise.schemaVersion > FILTER_SETTINGS_SCHEMA_VERSION;
  const decorrelatingAMSchemaSupported =
    sessionSchemaSupported &&
    rawDecorrelatingAM.schemaVersion === FILTER_SETTINGS_SCHEMA_VERSION;
  const decorrelatingAMIsOpaque =
    typeof rawDecorrelatingAM.schemaVersion === 'number' &&
    rawDecorrelatingAM.schemaVersion > FILTER_SETTINGS_SCHEMA_VERSION;
  const crNeuromodulationSchemaSupported =
    sessionSchemaSupported &&
    rawCRNeuromodulation.schemaVersion === FILTER_SETTINGS_SCHEMA_VERSION;
  const crNeuromodulationIsOpaque =
    typeof rawCRNeuromodulation.schemaVersion === 'number' &&
    rawCRNeuromodulation.schemaVersion > FILTER_SETTINGS_SCHEMA_VERSION;
  if (
    sessionIsOpaque ||
    whiteNoiseIsOpaque ||
    decorrelatingAMIsOpaque ||
    crNeuromodulationIsOpaque
  ) {
    return { kind: 'recovery', reason: 'newer-version', rawValue };
  }
  if (!whiteNoiseSchemaSupported) {
    repair('session.filterSettings.white-noise.schemaVersion');
  }
  if (!decorrelatingAMSchemaSupported) {
    repair('session.filterSettings.decorrelating-am.schemaVersion');
  }
  if (!crNeuromodulationSchemaSupported) {
    repairCR('schemaVersion');
  }

  const frequencyHz = isFiniteInRange(
    readableMatch.frequencyHz,
    MIN_TINNITUS_FREQUENCY_HZ,
    MAX_TINNITUS_FREQUENCY_HZ,
  )
    ? (readableMatch.frequencyHz as number)
    : defaultSession.tinnitusMatch.frequencyHz;
  if (frequencyHz !== readableMatch.frequencyHz) {
    repair('session.tinnitusMatch.frequencyHz');
  }

  const tinnitusType: TinnitusType =
    readableMatch.type === 'tone' || readableMatch.type === 'noise'
      ? readableMatch.type
      : defaultSession.tinnitusMatch.type;
  if (tinnitusType !== readableMatch.type) {
    repair('session.tinnitusMatch.type');
  }

  const audibilityByFrequencyHz: Record<string, Audibility> = {};
  for (const supportedFrequencyHz of AM_MATCH_FREQUENCIES_HZ) {
    const key = String(supportedFrequencyHz);
    const value = readableAudibility[key];
    if (value === 'unknown' || value === 'audible' || value === 'inaudible') {
      audibilityByFrequencyHz[key] = value;
    } else {
      audibilityByFrequencyHz[key] = 'unknown';
      repair(`session.tinnitusMatch.audibilityByFrequencyHz.${key}`);
    }
  }

  const masterGain = isFiniteInRange(readableSession.masterGain, 0, 1)
    ? (readableSession.masterGain as number)
    : defaultSession.masterGain;
  if (masterGain !== readableSession.masterGain) repair('session.masterGain');

  const selectedFilterId =
    readableSession.selectedFilterId === 'white-noise' ||
    readableSession.selectedFilterId === 'decorrelating-am' ||
    readableSession.selectedFilterId === 'cr-neuromodulation'
      ? readableSession.selectedFilterId
      : defaultSession.selectedFilterId;
  if (selectedFilterId !== readableSession.selectedFilterId) {
    repair('session.selectedFilterId');
  }

  const whiteNoiseQ =
    whiteNoiseSchemaSupported &&
    isFiniteInRange(rawWhiteNoise.q, MIN_WHITE_NOISE_Q, MAX_WHITE_NOISE_Q)
      ? (rawWhiteNoise.q as number)
      : defaultSession.filterSettings['white-noise'].q;
  if (whiteNoiseQ !== rawWhiteNoise.q) {
    repair('session.filterSettings.white-noise.q');
  }

  const rawHearingCorrection = rawDecorrelatingAM.hearingCorrection;
  const hearingCorrection: HearingCorrectionId | null =
    decorrelatingAMSchemaSupported &&
    (rawHearingCorrection === null ||
      rawHearingCorrection === 'a1' ||
      rawHearingCorrection === 'a2' ||
      rawHearingCorrection === 'c1' ||
      rawHearingCorrection === 'c2')
      ? rawHearingCorrection
      : null;
  if (hearingCorrection !== rawHearingCorrection) {
    repair('session.filterSettings.decorrelating-am.hearingCorrection');
  }

  const rawProjection = rawDecorrelatingAM.confirmedProjectionHz;
  const confirmedProjectionHz =
    decorrelatingAMSchemaSupported &&
    (rawProjection === null ||
      AM_MATCH_FREQUENCIES_HZ.includes(
        rawProjection as (typeof AM_MATCH_FREQUENCIES_HZ)[number],
      ))
      ? (rawProjection as number | null)
      : null;
  if (confirmedProjectionHz !== rawProjection) {
    repair('session.filterSettings.decorrelating-am.confirmedProjectionHz');
  }

  const defaultCR = defaultSession.filterSettings['cr-neuromodulation'];
  const crNotchedNoise =
    crNeuromodulationSchemaSupported &&
    typeof rawCRNeuromodulation.notchedNoise === 'boolean'
      ? rawCRNeuromodulation.notchedNoise
      : defaultCR.notchedNoise;
  if (crNotchedNoise !== rawCRNeuromodulation.notchedNoise) {
    repairCR('notchedNoise');
  }
  const crNoiseLevel =
    crNeuromodulationSchemaSupported &&
    isFiniteInRange(
      rawCRNeuromodulation.noiseLevel,
      MIN_CR_NOISE_LEVEL,
      MAX_CR_NOISE_LEVEL,
    )
      ? (rawCRNeuromodulation.noiseLevel as number)
      : defaultCR.noiseLevel;
  if (crNoiseLevel !== rawCRNeuromodulation.noiseLevel) {
    repairCR('noiseLevel');
  }
  const crNotchQ =
    crNeuromodulationSchemaSupported &&
    isFiniteInRange(
      rawCRNeuromodulation.notchQ,
      MIN_WHITE_NOISE_Q,
      MAX_WHITE_NOISE_Q,
    )
      ? (rawCRNeuromodulation.notchQ as number)
      : defaultCR.notchQ;
  if (crNotchQ !== rawCRNeuromodulation.notchQ) {
    repairCR('notchQ');
  }

  const session: TherapySession = {
    tinnitusMatch: { frequencyHz, type: tinnitusType, audibilityByFrequencyHz },
    masterGain,
    selectedFilterId,
    filterSettings: {
      'white-noise': { q: whiteNoiseQ },
      'decorrelating-am': { hearingCorrection, confirmedProjectionHz },
      'cr-neuromodulation': {
        notchedNoise: crNotchedNoise,
        noiseLevel: crNoiseLevel,
        notchQ: crNotchQ,
      },
    },
  };

  const presetEntries = Array.isArray(parsed.presets)
    ? parsed.presets.map(parsePreset)
    : [];
  if (!Array.isArray(parsed.presets)) repair('presets');

  const loadedPresetId =
    typeof parsed.loadedPresetId === 'string' &&
    presetEntries.some(
      entry =>
        entry.kind === 'available' && entry.preset.id === parsed.loadedPresetId,
    )
      ? parsed.loadedPresetId
      : null;
  if (parsed.loadedPresetId !== null && loadedPresetId === null) {
    repair('loadedPresetId');
  }

  const document: WorkspaceDocument = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    revision: parsed.revision as number,
    session,
    presetEntries,
    loadedPresetId,
    preservedRaw: {
      root: cloneJsonValue(parsed),
      session: cloneJsonValue(rawSession),
      sessionIsOpaque,
      tinnitusMatch: cloneJsonValue(rawMatch),
      audibility: cloneJsonValue(rawAudibility),
      filterSettings: cloneJsonValue(rawFilterSettings),
      whiteNoise: cloneJsonValue(rawWhiteNoise),
      whiteNoiseIsOpaque,
      decorrelatingAM: cloneJsonValue(rawDecorrelatingAM),
      decorrelatingAMIsOpaque,
      crNeuromodulation: cloneJsonValue(rawCRNeuromodulation),
      crNeuromodulationIsOpaque,
    },
  };

  return { kind: 'decoded', document, repairedFields };
}

export function toWorkspacePresetEntries(
  document: WorkspaceDocument,
): WorkspaceDocumentPresetEntry[] {
  return document.presetEntries
    .map(entry => {
      if (entry.kind === 'available') {
        return { kind: 'available' as const, preset: entry.preset };
      }
      return {
        kind: 'unavailable' as const,
        id: entry.id,
        name: entry.name,
        updatedAt: entry.updatedAt,
        reason: entry.reason,
      };
    })
    .sort((left, right) => {
      const leftUpdatedAt =
        left.kind === 'available' ? left.preset.updatedAt : left.updatedAt;
      const rightUpdatedAt =
        right.kind === 'available' ? right.preset.updatedAt : right.updatedAt;
      const leftId = left.kind === 'available' ? left.preset.id : left.id;
      const rightId = right.kind === 'available' ? right.preset.id : right.id;
      return rightUpdatedAt - leftUpdatedAt || leftId.localeCompare(rightId);
    });
}
