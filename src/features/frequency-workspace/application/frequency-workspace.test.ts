import { describe, expect, it, vi } from 'vitest';

import { AM_MATCH_FREQUENCIES_HZ } from '../model/session';
import {
  createInitialWorkspaceDocument,
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
} from '../persistence/workspace-document';
import { createFakeTherapyPlayback } from '../test-support/fake-therapy-playback';
import { MemoryWorkspaceDocumentStore } from '../test-support/memory-workspace-document-store';
import { createFrequencyWorkspace } from './frequency-workspace';

async function waitUntilReady(
  workspace: ReturnType<typeof createFrequencyWorkspace>,
) {
  await vi.waitFor(() => expect(workspace.getSnapshot().phase).toBe('ready'));
}

function testDependencies(store = new MemoryWorkspaceDocumentStore()) {
  let sequence = 0;
  return {
    store,
    playback: createFakeTherapyPlayback(),
    now: () => 1_000 + sequence,
    createId: () => `id-${++sequence}`,
    debounceMs: 0,
    downloadRecoveryData: vi.fn(),
  };
}

class FakePageLifecycle {
  readonly listeners = new Set<() => void>();

  addEventListener(type: 'pagehide', listener: () => void) {
    if (type === 'pagehide') this.listeners.add(listener);
  }

  removeEventListener(type: 'pagehide', listener: () => void) {
    if (type === 'pagehide') this.listeners.delete(listener);
  }

  pagehide() {
    for (const listener of this.listeners) listener();
  }
}

describe('FrequencyWorkspace', () => {
  it('starts booting, then persists one default v1 document', async () => {
    const dependencies = testDependencies();
    const workspace = createFrequencyWorkspace(dependencies);

    expect(workspace.getSnapshot()).toMatchObject({
      phase: 'booting',
      capabilities: { canEdit: false, canStart: false },
    });
    await waitUntilReady(workspace);

    expect(workspace.getSnapshot()).toMatchObject({
      phase: 'ready',
      loadedPresetId: null,
      session: {
        tinnitusMatch: { frequencyHz: 3_000, type: 'tone' },
        selectedFilterId: 'white-noise',
      },
      capabilities: { canEdit: true, canStart: true },
    });
    const stored = dependencies.store.load();
    expect(stored.kind).toBe('stored');
    if (stored.kind === 'stored') {
      const decoded = decodeWorkspaceDocument(stored.rawValue);
      expect(decoded).toMatchObject({
        kind: 'decoded',
        document: { schemaVersion: 1, revision: 1 },
      });
    }

    await workspace.dispose();
    await expect(workspace.dispose()).resolves.toBeUndefined();
  });

  it('coalesces a live frequency preview into playback and persists the commit', async () => {
    const dependencies = testDependencies();
    const workspace = createFrequencyWorkspace(dependencies);
    await waitUntilReady(workspace);

    workspace.dispatch({ type: 'start-therapy' });
    workspace.dispatch({ type: 'preview-frequency', frequencyHz: 4_200 });

    expect(dependencies.playback.intents.at(-1)).toMatchObject({
      type: 'apply-live-session',
      session: { tinnitusMatch: { frequencyHz: 4_200 } },
    });
    expect(workspace.getSnapshot().session?.tinnitusMatch.frequencyHz).toBe(
      3_000,
    );
    expect(workspace.getSnapshot().previewFrequencyHz).toBe(4_200);

    workspace.dispatch({ type: 'commit-frequency', frequencyHz: 4_200 });
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().persistence.status).toBe('saved'),
    );
    expect(workspace.getSnapshot().session?.tinnitusMatch.frequencyHz).toBe(
      4_200,
    );
    expect(workspace.getSnapshot().previewFrequencyHz).toBeNull();

    await workspace.dispose();
  });

  it('confirms preset deletion and can restore the exact entry', async () => {
    const dependencies = testDependencies();
    const workspace = createFrequencyWorkspace(dependencies);
    await waitUntilReady(workspace);

    workspace.dispatch({ type: 'create-preset', name: ' Evening ' });
    const created = workspace.getSnapshot().presets[0];
    expect(created?.kind).toBe('available');
    if (!created || created.kind !== 'available') return;
    expect(workspace.getSnapshot().loadedPresetId).toBe(created.preset.id);

    workspace.dispatch({ type: 'delete-preset', id: created.preset.id });
    const confirmation = workspace.getSnapshot().pendingConfirmation;
    expect(confirmation).toMatchObject({
      kind: 'delete-preset',
      presetId: created.preset.id,
    });
    expect(workspace.getSnapshot().presets).toHaveLength(1);
    if (!confirmation || confirmation.kind !== 'delete-preset') return;

    workspace.dispatch({
      type: 'confirm-delete-preset',
      confirmationId: confirmation.id,
      originRevision: confirmation.originRevision,
    });
    expect(workspace.getSnapshot().presets).toHaveLength(0);

    workspace.dispatch({
      type: 'undo-delete-preset',
      id: created.preset.id,
    });
    expect(workspace.getSnapshot().presets).toEqual([created]);

    await workspace.dispose();
  });

  it('keeps malformed storage in recovery until a confirmed reset', async () => {
    const store = new MemoryWorkspaceDocumentStore('{broken');
    const dependencies = testDependencies(store);
    const workspace = createFrequencyWorkspace(dependencies);

    await vi.waitFor(() =>
      expect(workspace.getSnapshot().phase).toBe('recovery'),
    );
    workspace.dispatch({ type: 'download-recovery-data' });
    expect(dependencies.downloadRecoveryData).toHaveBeenCalledWith('{broken');

    workspace.dispatch({ type: 'request-reset-local-data' });
    const confirmation = workspace.getSnapshot().pendingConfirmation;
    expect(confirmation?.kind).toBe('reset-local-data');
    if (!confirmation || confirmation.kind !== 'reset-local-data') return;
    workspace.dispatch({
      type: 'confirm-reset-local-data',
      confirmationId: confirmation.id,
      originRevision: confirmation.originRevision,
    });
    await waitUntilReady(workspace);
    expect(workspace.getSnapshot().session?.tinnitusMatch.frequencyHz).toBe(
      3_000,
    );

    await workspace.dispose();
  });

  it('keeps confirmations valid across persistence normalization but rejects later edits', async () => {
    const dependencies = testDependencies();
    const workspace = createFrequencyWorkspace(dependencies);
    await waitUntilReady(workspace);
    workspace.dispatch({ type: 'create-preset', name: 'Stable' });
    const preset = workspace.getSnapshot().presets[0];
    if (!preset || preset.kind !== 'available') return;

    workspace.dispatch({ type: 'set-master-gain', value: 0.2 });
    workspace.dispatch({ type: 'set-master-gain', value: 0.3 });
    workspace.dispatch({ type: 'delete-preset', id: preset.preset.id });
    const stableConfirmation = workspace.getSnapshot().pendingConfirmation;
    if (!stableConfirmation || stableConfirmation.kind !== 'delete-preset') {
      return;
    }
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().persistence.status).toBe('saved'),
    );
    workspace.dispatch({
      type: 'confirm-delete-preset',
      confirmationId: stableConfirmation.id,
      originRevision: stableConfirmation.originRevision,
    });
    expect(workspace.getSnapshot().presets).toHaveLength(0);

    workspace.dispatch({ type: 'create-preset', name: 'Stale' });
    const nextPreset = workspace.getSnapshot().presets[0];
    if (!nextPreset || nextPreset.kind !== 'available') return;
    workspace.dispatch({ type: 'delete-preset', id: nextPreset.preset.id });
    const staleConfirmation = workspace.getSnapshot().pendingConfirmation;
    if (!staleConfirmation || staleConfirmation.kind !== 'delete-preset') {
      return;
    }
    workspace.dispatch({ type: 'set-master-gain', value: 0.4 });
    workspace.dispatch({
      type: 'confirm-delete-preset',
      confirmationId: staleConfirmation.id,
      originRevision: staleConfirmation.originRevision,
    });
    expect(workspace.getSnapshot().presets).toHaveLength(1);

    await workspace.dispose();
  });

  it('flushes pending user changes on pagehide without rewriting repaired input on dispose', async () => {
    const document = createInitialWorkspaceDocument();
    const raw = JSON.parse(encodeWorkspaceDocument(document)) as Record<
      string,
      unknown
    >;
    (raw.session as Record<string, unknown>).masterGain = 'invalid';
    const repairedRaw = JSON.stringify(raw);
    const repairedStore = new MemoryWorkspaceDocumentStore(repairedRaw);
    const repairedWorkspace = createFrequencyWorkspace(
      testDependencies(repairedStore),
    );
    await waitUntilReady(repairedWorkspace);
    expect(repairedWorkspace.getSnapshot().persistence.dirty).toBe(false);
    await repairedWorkspace.dispose();
    expect(repairedStore.load()).toEqual({
      kind: 'stored',
      rawValue: repairedRaw,
    });

    const pageLifecycle = new FakePageLifecycle();
    const dependencies = {
      ...testDependencies(),
      debounceMs: 60_000,
      pageLifecycle,
    };
    const workspace = createFrequencyWorkspace(dependencies);
    await waitUntilReady(workspace);
    workspace.dispatch({ type: 'set-master-gain', value: 0.25 });
    expect(workspace.getSnapshot().persistence.dirty).toBe(true);
    pageLifecycle.pagehide();
    expect(workspace.getSnapshot().persistence.status).toBe('saved');
    const stored = dependencies.store.load();
    if (stored.kind !== 'stored') return;
    expect(decodeWorkspaceDocument(stored.rawValue)).toMatchObject({
      kind: 'decoded',
      document: { session: { masterGain: 0.25 } },
    });

    await workspace.dispose();
    expect(pageLifecycle.listeners.size).toBe(0);
  });

  it('does not apply a storage-conflict decision after a newer local edit', async () => {
    const dependencies = testDependencies();
    const workspace = createFrequencyWorkspace(dependencies);
    await waitUntilReady(workspace);
    const stored = dependencies.store.load();
    if (stored.kind !== 'stored') return;
    const decoded = decodeWorkspaceDocument(stored.rawValue);
    if (decoded.kind !== 'decoded') return;
    const externalRawValue = encodeWorkspaceDocument({
      ...decoded.document,
      revision: decoded.document.revision + 1,
    });
    dependencies.store.simulateExternalChange(externalRawValue);
    const confirmation = workspace.getSnapshot().pendingConfirmation;
    expect(confirmation?.kind).toBe('storage-conflict');
    if (!confirmation || confirmation.kind !== 'storage-conflict') return;

    workspace.dispatch({ type: 'set-master-gain', value: 0.35 });
    workspace.dispatch({
      type: 'resolve-storage-conflict',
      confirmationId: confirmation.id,
      originRevision: confirmation.originRevision,
      resolution: 'load-external',
    });

    expect(workspace.getSnapshot()).toMatchObject({
      persistence: { status: 'conflict' },
      session: { masterGain: 0.35 },
      pendingConfirmation: { kind: 'storage-conflict' },
    });

    await workspace.dispose();
  });

  it('keeps the confirmed AM band playing until a new projection is confirmed', async () => {
    const dependencies = testDependencies();
    const workspace = createFrequencyWorkspace(dependencies);
    await waitUntilReady(workspace);
    workspace.dispatch({
      type: 'select-filter',
      filterId: 'decorrelating-am',
    });
    let confirmation = workspace.getSnapshot().pendingConfirmation;
    if (!confirmation || confirmation.kind !== 'am-projection') return;
    workspace.dispatch({
      type: 'confirm-am-projection',
      confirmationId: confirmation.id,
      originRevision: confirmation.originRevision,
    });
    for (const frequencyHz of AM_MATCH_FREQUENCIES_HZ) {
      workspace.dispatch({
        type: 'set-audibility',
        frequencyHz,
        value: 'audible',
      });
    }
    workspace.dispatch({ type: 'set-hearing-correction', value: 'a1' });
    workspace.dispatch({ type: 'start-therapy' });
    expect(workspace.getSnapshot().playback.status).toBe('playing');

    const intentOffset = dependencies.playback.intents.length;
    workspace.dispatch({ type: 'commit-frequency', frequencyHz: 4_100 });
    confirmation = workspace.getSnapshot().pendingConfirmation;
    expect(confirmation?.kind).toBe('am-projection');
    expect(workspace.getSnapshot().playback.status).toBe('playing');
    expect(
      dependencies.playback.intents.slice(intentOffset),
    ).not.toContainEqual({
      type: 'stop',
    });

    await workspace.dispose();
  });
});
