import { describe, expect, it } from 'vitest';

import { createTherapyPreset } from '../model/preset';
import { createDefaultTherapySession } from '../model/session';
import {
  createInitialWorkspaceDocument,
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
  removeWorkspaceDocumentPreset,
  restoreWorkspaceDocumentPreset,
  toWorkspacePresetEntries,
  updateWorkspaceDocument,
} from './workspace-document';

describe('workspace document', () => {
  it('round-trips the initial revisioned document without playback state', () => {
    const document = createInitialWorkspaceDocument();
    const encoded = encodeWorkspaceDocument(document);
    const decoded = decodeWorkspaceDocument(encoded);

    expect(JSON.parse(encoded)).toMatchObject({
      schemaVersion: 1,
      revision: 1,
      session: {
        schemaVersion: 1,
        tinnitusMatch: { frequencyHz: 3000, type: 'tone' },
        masterGain: 0.1,
        selectedFilterId: 'white-noise',
        filterSettings: {
          'white-noise': { schemaVersion: 1, q: 1 },
          'decorrelating-am': {
            schemaVersion: 1,
            hearingCorrection: null,
            confirmedProjectionHz: null,
          },
        },
      },
      presets: [],
      loadedPresetId: null,
    });
    expect(encoded).not.toContain('playback');
    expect(decoded).toMatchObject({
      kind: 'decoded',
      repairedFields: [],
      document: {
        revision: 1,
        loadedPresetId: null,
        presetEntries: [],
      },
    });
  });

  it('repairs fields independently and emits preserved unknown data unchanged', () => {
    const source = JSON.parse(
      encodeWorkspaceDocument(createInitialWorkspaceDocument()),
    );
    source.revision = 7;
    source.futureRoot = { enabled: true };
    source.session.futureSession = 'keep';
    source.session.tinnitusMatch.frequencyHz = '4000';
    source.session.tinnitusMatch.type = 'noise';
    source.session.tinnitusMatch.futureMatch = 42;
    source.session.tinnitusMatch.audibilityByFrequencyHz['1000'] = 'audible';
    source.session.tinnitusMatch.audibilityByFrequencyHz['1200'] = true;
    source.session.tinnitusMatch.audibilityByFrequencyHz.futureHz = {
      preserve: true,
    };
    source.session.masterGain = 0.4;
    source.session.selectedFilterId = 'future-filter';
    source.session.filterSettings['white-noise'] = {
      schemaVersion: 1,
      q: 3,
      futureWhite: 'keep',
    };
    source.session.filterSettings['decorrelating-am'] = {
      schemaVersion: 1,
      hearingCorrection: 'c1',
      confirmedProjectionHz: 2800,
      futureAM: ['keep'],
    };
    source.session.filterSettings['future-filter'] = {
      schemaVersion: 9,
      payload: 'unchanged',
    };
    const raw = JSON.stringify(source);

    const decoded = decodeWorkspaceDocument(raw);
    expect(decoded).toMatchObject({
      kind: 'decoded',
      repairedFields: [
        'session.tinnitusMatch.frequencyHz',
        'session.tinnitusMatch.audibilityByFrequencyHz.1200',
        'session.selectedFilterId',
      ],
      document: {
        revision: 7,
        session: {
          tinnitusMatch: {
            frequencyHz: 3000,
            type: 'noise',
            audibilityByFrequencyHz: { 1000: 'audible', 1200: 'unknown' },
          },
          masterGain: 0.4,
          selectedFilterId: 'white-noise',
          filterSettings: {
            'white-noise': { q: 3 },
            'decorrelating-am': {
              hearingCorrection: 'c1',
              confirmedProjectionHz: 2800,
            },
          },
        },
      },
    });
    if (decoded.kind !== 'decoded')
      throw new Error('expected decoded document');

    expect(JSON.parse(encodeWorkspaceDocument(decoded.document))).toMatchObject(
      {
        futureRoot: { enabled: true },
        session: {
          futureSession: 'keep',
          tinnitusMatch: {
            frequencyHz: 3000,
            futureMatch: 42,
            audibilityByFrequencyHz: { futureHz: { preserve: true } },
          },
          filterSettings: {
            'white-noise': { futureWhite: 'keep' },
            'decorrelating-am': { futureAM: ['keep'] },
            'future-filter': { schemaVersion: 9, payload: 'unchanged' },
          },
        },
      },
    );
  });

  it('keeps a newer session payload opaque until a confirmed reset', () => {
    const source = JSON.parse(
      encodeWorkspaceDocument(createInitialWorkspaceDocument()),
    );
    const newerSession = {
      schemaVersion: 2,
      tinnitusMatch: {
        frequencyHz: 12_345,
        type: 'future-type',
        futureMatching: { exact: true },
      },
      masterGain: { futureScale: 10 },
      selectedFilterId: 'future-filter',
      filterSettings: { future: { schemaVersion: 3, payload: [1, 2, 3] } },
      opaqueSessionField: 'keep-exactly',
    };
    source.session = newerSession;

    const rawValue = JSON.stringify(source);
    expect(decodeWorkspaceDocument(rawValue)).toEqual({
      kind: 'recovery',
      reason: 'newer-version',
      rawValue,
    });
  });

  it('keeps newer known filter settings opaque until a confirmed reset', () => {
    const source = JSON.parse(
      encodeWorkspaceDocument(createInitialWorkspaceDocument()),
    );
    const newerWhiteNoise = {
      schemaVersion: 2,
      q: { futureShape: 7 },
      futureNotch: ['keep', 'exactly'],
    };
    const newerDecorrelatingAM = {
      schemaVersion: 3,
      hearingCorrection: { futureCurve: 'x' },
      confirmedProjectionHz: 'future-projection',
      futureDsp: { payload: [4, 5, 6] },
    };
    source.session.filterSettings['white-noise'] = newerWhiteNoise;
    source.session.filterSettings['decorrelating-am'] = newerDecorrelatingAM;

    const rawValue = JSON.stringify(source);
    expect(decodeWorkspaceDocument(rawValue)).toEqual({
      kind: 'recovery',
      reason: 'newer-version',
      rawValue,
    });
  });

  it('exposes valid and unavailable presets while preserving unavailable payloads exactly', () => {
    const source = JSON.parse(
      encodeWorkspaceDocument(createInitialWorkspaceDocument()),
    );
    const match = source.session.tinnitusMatch;
    const validPreset = {
      schemaVersion: 1,
      id: 'valid',
      name: 'Valid White',
      createdAt: 100,
      updatedAt: 200,
      tinnitusMatch: match,
      masterGain: 0.2,
      filterId: 'white-noise',
      filterSettings: { schemaVersion: 1, q: 2, futureSetting: 'keep' },
      futurePreset: { keep: true },
    };
    const unknownFilter = {
      schemaVersion: 1,
      id: 'future',
      name: 'Future Filter',
      createdAt: 300,
      updatedAt: 400,
      tinnitusMatch: match,
      masterGain: 0.2,
      filterId: 'spectral-future',
      filterSettings: { schemaVersion: 1, payload: [1, 2, 3] },
    };
    const newerPreset = {
      schemaVersion: 2,
      id: 'newer',
      name: 'Newer Preset',
      updatedAt: 500,
      payload: { exact: 'value' },
    };
    const invalidPreset = {
      schemaVersion: 1,
      id: 'broken',
      name: 'Broken Preset',
      createdAt: 600,
      updatedAt: 700,
      tinnitusMatch: match,
      masterGain: '0.2',
      filterId: 'white-noise',
      filterSettings: { schemaVersion: 1, q: 2 },
    };
    source.presets = [validPreset, unknownFilter, newerPreset, invalidPreset];
    source.loadedPresetId = 'valid';

    const decoded = decodeWorkspaceDocument(JSON.stringify(source));
    expect(decoded).toMatchObject({
      kind: 'decoded',
      document: { loadedPresetId: 'valid' },
    });
    if (decoded.kind !== 'decoded')
      throw new Error('expected decoded document');

    expect(toWorkspacePresetEntries(decoded.document)).toEqual([
      {
        kind: 'unavailable',
        id: 'broken',
        name: 'Broken Preset',
        updatedAt: 700,
        reason: 'invalid-data',
      },
      {
        kind: 'unavailable',
        id: 'newer',
        name: 'Newer Preset',
        updatedAt: 500,
        reason: 'newer-version',
      },
      {
        kind: 'unavailable',
        id: 'future',
        name: 'Future Filter',
        updatedAt: 400,
        reason: 'unknown-filter',
      },
      {
        kind: 'available',
        preset: expect.objectContaining({
          id: 'valid',
          name: 'Valid White',
          filterId: 'white-noise',
          filterSettings: { q: 2 },
        }),
      },
    ]);

    const reencoded = JSON.parse(encodeWorkspaceDocument(decoded.document));
    expect(reencoded.presets[1]).toEqual(unknownFilter);
    expect(reencoded.presets[2]).toEqual(newerPreset);
    expect(reencoded.presets[3]).toEqual(invalidPreset);
    expect(reencoded.presets[0]).toMatchObject({
      futurePreset: { keep: true },
      filterSettings: { futureSetting: 'keep' },
    });
  });

  it('updates session, preset collection, association, and revision as one document', () => {
    const source = JSON.parse(
      encodeWorkspaceDocument(createInitialWorkspaceDocument()),
    );
    const unavailableRaw = { schemaVersion: 9, opaque: { exact: true } };
    source.presets = [unavailableRaw];
    const decoded = decodeWorkspaceDocument(JSON.stringify(source));
    if (decoded.kind !== 'decoded')
      throw new Error('expected decoded document');

    const session = createDefaultTherapySession();
    const preset = createTherapyPreset({
      id: 'created',
      name: 'Created',
      now: 100,
      session,
    });
    const updated = updateWorkspaceDocument(decoded.document, {
      session,
      availablePresets: [preset],
      loadedPresetId: preset.id,
    });

    expect(updated.revision).toBe(2);
    expect(updated.loadedPresetId).toBe('created');
    expect(toWorkspacePresetEntries(updated)).toHaveLength(2);
    const encoded = JSON.parse(encodeWorkspaceDocument(updated));
    expect(encoded.presets[0]).toEqual(unavailableRaw);
    expect(encoded.presets[1]).toMatchObject({
      id: 'created',
      name: 'Created',
    });

    const removed = updateWorkspaceDocument(updated, {
      availablePresets: [],
      loadedPresetId: null,
    });
    expect(removed.revision).toBe(3);
    expect(JSON.parse(encodeWorkspaceDocument(removed)).presets).toEqual([
      unavailableRaw,
    ]);
  });

  it('deletes and restores an unavailable preset without changing its payload', () => {
    const source = JSON.parse(
      encodeWorkspaceDocument(createInitialWorkspaceDocument()),
    );
    const unavailableRaw = { schemaVersion: 4, opaque: ['exact', 1] };
    source.presets = [unavailableRaw];
    const decoded = decodeWorkspaceDocument(JSON.stringify(source));
    if (decoded.kind !== 'decoded')
      throw new Error('expected decoded document');

    const deletion = removeWorkspaceDocumentPreset(
      decoded.document,
      'unavailable-0',
    );
    expect(deletion.removed).not.toBeNull();
    expect(deletion.document.revision).toBe(2);
    expect(
      JSON.parse(encodeWorkspaceDocument(deletion.document)).presets,
    ).toEqual([]);

    if (deletion.removed === null) throw new Error('expected removed preset');
    const restored = restoreWorkspaceDocumentPreset(
      deletion.document,
      deletion.removed,
    );
    expect(restored.revision).toBe(3);
    expect(JSON.parse(encodeWorkspaceDocument(restored)).presets).toEqual([
      unavailableRaw,
    ]);
  });

  it('keeps malformed and newer envelope values intact for explicit recovery', () => {
    const malformed = '{"schemaVersion":1';
    const newer = JSON.stringify({
      schemaVersion: 2,
      revision: 99,
      exact: { payload: true },
    });

    expect(decodeWorkspaceDocument(malformed)).toEqual({
      kind: 'recovery',
      reason: 'malformed-json',
      rawValue: malformed,
    });
    expect(decodeWorkspaceDocument(newer)).toEqual({
      kind: 'recovery',
      reason: 'newer-version',
      rawValue: newer,
    });
  });
});
