import {
  applyTherapyPreset,
  createTherapyPreset,
  isSessionDirtyForPreset,
  renameTherapyPreset,
  replaceTherapyPresetSnapshot,
} from '../model/preset';
import {
  applySessionChange,
  getNearestAMProjectionHz,
  getTherapySessionReadiness,
  type TherapySessionChange,
} from '../model/session';
import type {
  TherapyFilterDescription,
  TherapyPreset,
  TherapySession,
} from '../model/types';
import { createBrowserWorkspaceDocumentStore } from '../persistence/browser-workspace-document-store';
import {
  createInitialWorkspaceDocument,
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
  removeWorkspaceDocumentPreset,
  restoreWorkspaceDocumentPreset,
  toWorkspacePresetEntries,
  updateWorkspaceDocument,
  type WorkspaceDocument,
  type WorkspaceDocumentPreset,
} from '../persistence/workspace-document';
import { readWorkspaceRevision } from '../persistence/workspace-document-revision';
import type { WorkspaceDocumentStore } from '../persistence/workspace-document-store';
import type { TherapyPlayback } from '../playback/contracts';
import { createTherapyPlayback } from '../playback/therapy-playback';
import type {
  FrequencyWorkspace,
  PendingWorkspaceConfirmation,
  WorkspaceIntent,
  WorkspaceNotification,
  WorkspacePersistenceSnapshot,
  WorkspaceSnapshot,
} from './contracts';

const BOOTING_SNAPSHOT: WorkspaceSnapshot = Object.freeze({
  phase: 'booting',
  session: null,
  previewFrequencyHz: null,
  filters: Object.freeze([]),
  selectedFilter: null,
  presets: Object.freeze([]),
  loadedPresetId: null,
  dirtyPresetId: null,
  playback: Object.freeze({
    status: 'stopped',
    source: Object.freeze({ kind: 'none' }),
    error: null,
    spectrum: Object.freeze({
      sampleRate: 0,
      fftSize: 8_192,
      minDecibels: -100,
      maxDecibels: 0,
      smoothing: 0.8,
    }),
  }),
  persistence: Object.freeze({
    status: 'idle',
    revision: null,
    dirty: false,
    errorCode: null,
  }),
  pendingConfirmation: null,
  capabilities: Object.freeze({
    canEdit: false,
    canPreviewMatchingStimulus: false,
    canPreviewHearingCorrection: false,
    canStart: false,
    canPause: false,
    canContinue: false,
    canStop: false,
    canSavePreset: false,
    canLoadPreset: false,
  }),
  notifications: Object.freeze([]),
});

interface PageLifecycle {
  addEventListener(type: 'pagehide', listener: () => void): void;
  removeEventListener(type: 'pagehide', listener: () => void): void;
}

export interface FrequencyWorkspaceDependencies {
  readonly store?: WorkspaceDocumentStore;
  readonly playback?: TherapyPlayback;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly debounceMs?: number;
  readonly downloadRecoveryData?: (rawValue: string) => void;
  readonly pageLifecycle?: PageLifecycle | null;
}

function defaultId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function downloadRawValue(rawValue: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([rawValue], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tinnitusnotch-recovery-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function availablePresets(document: WorkspaceDocument): TherapyPreset[] {
  return document.presetEntries.flatMap(entry =>
    entry.kind === 'available' ? [entry.preset] : [],
  );
}

function availablePreset(
  document: WorkspaceDocument,
  id: string,
): TherapyPreset | null {
  const entry = document.presetEntries.find(
    candidate => candidate.kind === 'available' && candidate.preset.id === id,
  );
  return entry?.kind === 'available' ? entry.preset : null;
}

export function createFrequencyWorkspace(
  overrides: FrequencyWorkspaceDependencies = {},
): FrequencyWorkspace {
  const store = overrides.store ?? createBrowserWorkspaceDocumentStore();
  const playback = overrides.playback ?? createTherapyPlayback();
  const now = overrides.now ?? Date.now;
  const createId = overrides.createId ?? defaultId;
  const debounceMs = overrides.debounceMs ?? 250;
  const downloadRecoveryData =
    overrides.downloadRecoveryData ?? downloadRawValue;
  const pageLifecycle =
    overrides.pageLifecycle ?? (typeof window === 'undefined' ? null : window);
  const listeners = new Set<(snapshot: WorkspaceSnapshot) => void>();

  let snapshot = BOOTING_SNAPSHOT;
  let phase: WorkspaceSnapshot['phase'] = 'booting';
  let documentState: WorkspaceDocument | null = null;
  let previewFrequencyHz: number | null = null;
  let persistence: WorkspacePersistenceSnapshot = BOOTING_SNAPSHOT.persistence;
  let pendingConfirmation: PendingWorkspaceConfirmation | null = null;
  let notifications: WorkspaceNotification[] = [];
  let recoveryRawValue: string | null = null;
  let recoveryExpectedRevision: number | null | undefined = null;
  let externalRawValue: string | null | undefined;
  let deletedPreset: WorkspaceDocumentPreset | null = null;
  let deletedPresetTimer: ReturnType<typeof setTimeout> | null = null;
  let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeStore: () => void = () => undefined;
  let disposed = false;
  let applicationRevision = 0;

  function markApplicationChanged(): void {
    applicationRevision += 1;
  }

  function notify(
    kind: WorkspaceNotification['kind'],
    code: string,
    field: string | null = null,
  ) {
    notifications = [
      ...notifications.slice(-4),
      { id: createId(), kind, code, field },
    ];
  }

  function filterDescriptions(): readonly TherapyFilterDescription[] {
    const failedFilter =
      playback.getSnapshot().error?.code === 'filter-unavailable'
        ? playback.getSnapshot().error?.filterId
        : null;
    return [
      {
        id: 'white-noise',
        label: 'White Noise',
        experimental: false,
        ready: failedFilter !== 'white-noise',
        unavailableReason:
          failedFilter === 'white-noise'
            ? 'Источник White Noise недоступен до повторного запуска.'
            : null,
      },
      {
        id: 'decorrelating-am',
        label: 'De-correlating AM',
        experimental: true,
        ready: failedFilter !== 'decorrelating-am',
        unavailableReason:
          failedFilter === 'decorrelating-am'
            ? 'AudioWorklet недоступен до явного Retry.'
            : null,
      },
      {
        id: 'cr-neuromodulation',
        label: 'CR Neuromodulation',
        experimental: true,
        ready: failedFilter !== 'cr-neuromodulation',
        unavailableReason:
          failedFilter === 'cr-neuromodulation'
            ? 'AudioWorklet недоступен до явного Retry.'
            : null,
      },
    ];
  }

  function buildSnapshot(): WorkspaceSnapshot {
    const session = documentState?.session ?? null;
    const filters = session ? filterDescriptions() : [];
    const selectedFilter = session
      ? (filters.find(filter => filter.id === session.selectedFilterId) ?? null)
      : null;
    const playbackSnapshot = playback.getSnapshot();
    const readiness = session ? getTherapySessionReadiness(session) : null;
    const loadedPreset =
      documentState?.loadedPresetId && documentState
        ? availablePreset(documentState, documentState.loadedPresetId)
        : null;
    const dirtyPresetId =
      loadedPreset && session && isSessionDirtyForPreset(session, loadedPreset)
        ? loadedPreset.id
        : null;
    const ready = phase === 'ready' && session !== null;
    const storageWritable =
      persistence.status !== 'unavailable' &&
      persistence.status !== 'conflict' &&
      persistence.status !== 'recovery';
    const sourceReady = selectedFilter?.ready === true;

    return {
      phase,
      session,
      previewFrequencyHz,
      filters,
      selectedFilter,
      presets: documentState ? toWorkspacePresetEntries(documentState) : [],
      loadedPresetId: documentState?.loadedPresetId ?? null,
      dirtyPresetId,
      playback: playbackSnapshot,
      persistence,
      pendingConfirmation,
      capabilities: {
        canEdit: ready,
        canPreviewMatchingStimulus: ready,
        canPreviewHearingCorrection:
          ready && session?.selectedFilterId === 'decorrelating-am',
        canStart:
          ready &&
          sourceReady &&
          readiness?.ready === true &&
          playbackSnapshot.status !== 'playing' &&
          playbackSnapshot.status !== 'starting' &&
          playbackSnapshot.status !== 'stopping' &&
          playbackSnapshot.status !== 'paused',
        canPause: playbackSnapshot.status === 'playing',
        canContinue: playbackSnapshot.status === 'paused',
        canStop:
          playbackSnapshot.status === 'playing' ||
          playbackSnapshot.status === 'previewing' ||
          playbackSnapshot.status === 'starting' ||
          playbackSnapshot.status === 'paused',
        canSavePreset: ready && storageWritable && readiness?.ready === true,
        canLoadPreset: ready && storageWritable,
      },
      notifications,
    };
  }

  function publish() {
    if (disposed) return;
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function normalizedRevision(
    candidate: WorkspaceDocument,
    expectedRevision: number | null | undefined,
  ): WorkspaceDocument {
    return {
      ...candidate,
      revision: (expectedRevision ?? 0) + 1,
    };
  }

  function setConflict(currentRawValue: string | null) {
    markApplicationChanged();
    externalRawValue = currentRawValue;
    const externalRevision = readWorkspaceRevision(currentRawValue);
    persistence = {
      status: 'conflict',
      revision: persistence.revision,
      dirty: true,
      errorCode: 'revision-conflict',
    };
    pendingConfirmation = {
      kind: 'storage-conflict',
      id: createId(),
      originRevision: applicationRevision,
      externalRevision:
        typeof externalRevision === 'number' ? externalRevision : 0,
    };
    notify('warning', 'revision-conflict');
  }

  function commitDocument(
    candidate: WorkspaceDocument,
    applyOnFailure: boolean,
    expectedRevision: number | null = persistence.revision,
  ): boolean {
    const normalized = normalizedRevision(candidate, expectedRevision);
    const result = store.commit({
      rawValue: encodeWorkspaceDocument(normalized),
      revision: normalized.revision,
      expectedRevision,
    });
    if (result.kind === 'committed') {
      documentState = normalized;
      persistence = {
        status: 'saved',
        revision: result.revision,
        dirty: false,
        errorCode: null,
      };
      externalRawValue = undefined;
      return true;
    }
    if (applyOnFailure) documentState = candidate;
    if (result.kind === 'conflict') {
      setConflict(result.currentRawValue);
    } else {
      persistence = {
        status: 'unavailable',
        revision: persistence.revision,
        dirty: true,
        errorCode: 'storage-unavailable',
      };
      notify('warning', 'storage-unavailable');
    }
    return false;
  }

  function flushPersistence() {
    if (persistenceTimer !== null) {
      clearTimeout(persistenceTimer);
      persistenceTimer = null;
    }
    if (!documentState || !persistence.dirty) return;
    commitDocument(documentState, true);
    publish();
  }

  function schedulePersistence() {
    if (
      persistence.status === 'conflict' ||
      persistence.status === 'recovery'
    ) {
      persistence = { ...persistence, dirty: true };
      return;
    }
    if (persistence.status !== 'unavailable') {
      persistence = {
        status: 'saving',
        revision: persistence.revision,
        dirty: true,
        errorCode: null,
      };
    } else {
      persistence = { ...persistence, dirty: true };
    }
    if (persistenceTimer !== null) clearTimeout(persistenceTimer);
    persistenceTimer = setTimeout(flushPersistence, debounceMs);
  }

  function replaceSession(session: TherapySession) {
    if (!documentState) return;
    documentState = updateWorkspaceDocument(documentState, { session });
    markApplicationChanged();
    schedulePersistence();
  }

  function applyLiveSession(session: TherapySession) {
    playback.dispatch({ type: 'apply-live-session', session });
  }

  function applySession(change: TherapySessionChange, live = true) {
    if (!documentState || phase !== 'ready') return;
    try {
      const session = applySessionChange(documentState.session, change);
      replaceSession(session);
      if (live) applyLiveSession(session);
      publish();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'invalid-input');
      publish();
    }
  }

  function requestProjectionIfNeeded() {
    if (!documentState) return;
    if (pendingConfirmation?.kind === 'storage-conflict') return;
    const session = documentState.session;
    if (session.selectedFilterId !== 'decorrelating-am') return;
    const projectedFrequencyHz = getNearestAMProjectionHz(
      session.tinnitusMatch.frequencyHz,
    );
    if (
      session.filterSettings['decorrelating-am'].confirmedProjectionHz ===
      projectedFrequencyHz
    ) {
      return;
    }
    pendingConfirmation = {
      kind: 'am-projection',
      id: createId(),
      originRevision: applicationRevision,
      exactFrequencyHz: session.tinnitusMatch.frequencyHz,
      projectedFrequencyHz,
    };
  }

  function applyDocumentFromRaw(rawValue: string): boolean {
    const decoded = decodeWorkspaceDocument(rawValue);
    if (decoded.kind === 'recovery') {
      recoveryRawValue = decoded.rawValue;
      recoveryExpectedRevision = readWorkspaceRevision(rawValue);
      documentState = createInitialWorkspaceDocument();
      markApplicationChanged();
      phase = 'recovery';
      persistence = {
        status: 'recovery',
        revision:
          typeof recoveryExpectedRevision === 'number'
            ? recoveryExpectedRevision
            : null,
        dirty: false,
        errorCode: 'storage-unavailable',
      };
      return false;
    }
    documentState = decoded.document;
    markApplicationChanged();
    phase = 'ready';
    persistence = {
      status: 'saved',
      revision: decoded.document.revision,
      dirty: false,
      errorCode: null,
    };
    if (decoded.repairedFields.length > 0) {
      notify('warning', 'storage-repaired');
    }
    return true;
  }

  function initialize() {
    if (disposed) return;
    unsubscribeStore();
    const loaded = store.load();
    if (loaded.kind === 'missing') {
      const initial = createInitialWorkspaceDocument();
      documentState = initial;
      markApplicationChanged();
      phase = 'ready';
      persistence = {
        status: 'saving',
        revision: null,
        dirty: true,
        errorCode: null,
      };
      commitDocument(initial, true, null);
    } else if (loaded.kind === 'unavailable') {
      documentState = createInitialWorkspaceDocument();
      markApplicationChanged();
      phase = 'ready';
      persistence = {
        status: 'unavailable',
        revision: null,
        dirty: true,
        errorCode: 'storage-unavailable',
      };
      notify('warning', 'storage-unavailable');
    } else {
      applyDocumentFromRaw(loaded.rawValue);
    }
    unsubscribeStore = store.subscribe(change => {
      if (disposed) return;
      const currentEncoded = documentState
        ? encodeWorkspaceDocument(documentState)
        : null;
      if (change.rawValue === currentEncoded) return;
      setConflict(change.rawValue);
      publish();
    });
    publish();
  }

  function commitPresetCandidate(
    candidate: WorkspaceDocument,
    successCode: string,
  ): boolean {
    if (persistenceTimer !== null) {
      clearTimeout(persistenceTimer);
      persistenceTimer = null;
    }
    const committed = commitDocument(candidate, false);
    if (committed) {
      markApplicationChanged();
      notify('success', successCode);
    }
    publish();
    return committed;
  }

  function loadPresetNow(id: string) {
    if (!documentState) return;
    const preset = availablePreset(documentState, id);
    if (!preset) return;
    const session = applyTherapyPreset(documentState.session, preset);
    const candidate = updateWorkspaceDocument(documentState, {
      session,
      loadedPresetId: id,
    });
    if (commitPresetCandidate(candidate, 'preset-loaded')) {
      playback.dispatch({ type: 'stop' });
      previewFrequencyHz = null;
      publish();
    }
  }

  function requestLoadOrRevert(id: string, action: 'load' | 'revert') {
    if (!documentState) return;
    const loadedId = documentState.loadedPresetId;
    const loaded = loadedId ? availablePreset(documentState, loadedId) : null;
    if (loaded && isSessionDirtyForPreset(documentState.session, loaded)) {
      pendingConfirmation = {
        kind: 'discard-preset-edits',
        id: createId(),
        originRevision: applicationRevision,
        presetId: id,
        action,
      };
      publish();
      return;
    }
    loadPresetNow(id);
  }

  function deletePresetNow(id: string) {
    if (!documentState) return;
    const result = removeWorkspaceDocumentPreset(documentState, id);
    if (!result.removed) return;
    if (!commitPresetCandidate(result.document, 'preset-deleted')) return;
    deletedPreset = result.removed;
    if (deletedPresetTimer !== null) clearTimeout(deletedPresetTimer);
    deletedPresetTimer = setTimeout(() => {
      deletedPreset = null;
      deletedPresetTimer = null;
    }, 10_000);
    const latest = notifications.at(-1);
    if (latest?.code === 'preset-deleted') {
      notifications = [...notifications.slice(0, -1), { ...latest, field: id }];
    }
    publish();
  }

  function resolveStorageConflict(
    resolution: 'load-external' | 'overwrite-local',
  ) {
    if (externalRawValue === undefined || !documentState) return;
    playback.dispatch({ type: 'stop' });
    if (resolution === 'load-external') {
      if (externalRawValue === null) {
        const initial = createInitialWorkspaceDocument();
        persistence = {
          status: 'saving',
          revision: null,
          dirty: true,
          errorCode: null,
        };
        if (commitDocument(initial, true, null)) markApplicationChanged();
        phase = 'ready';
      } else {
        applyDocumentFromRaw(externalRawValue);
      }
    } else {
      const expectedRevision = readWorkspaceRevision(externalRawValue);
      if (expectedRevision === undefined) {
        recoveryRawValue = externalRawValue;
        recoveryExpectedRevision = undefined;
        phase = 'recovery';
        persistence = {
          status: 'recovery',
          revision: null,
          dirty: true,
          errorCode: 'revision-conflict',
        };
      } else {
        if (commitDocument(documentState, true, expectedRevision)) {
          markApplicationChanged();
        }
      }
    }
    externalRawValue = undefined;
    pendingConfirmation = null;
    publish();
  }

  function resetLocalData() {
    playback.dispatch({ type: 'stop' });
    const removed = store.remove(recoveryExpectedRevision);
    if (removed.kind !== 'removed') {
      if (removed.kind === 'conflict') setConflict(removed.currentRawValue);
      else {
        persistence = {
          status: 'unavailable',
          revision: persistence.revision,
          dirty: true,
          errorCode: 'storage-unavailable',
        };
      }
      publish();
      return;
    }
    recoveryRawValue = null;
    recoveryExpectedRevision = null;
    pendingConfirmation = null;
    const initial = createInitialWorkspaceDocument();
    persistence = {
      status: 'saving',
      revision: null,
      dirty: true,
      errorCode: null,
    };
    if (commitDocument(initial, true, null)) markApplicationChanged();
    phase = 'ready';
    publish();
  }

  function dispatch(intent: WorkspaceIntent): void {
    if (disposed || phase === 'booting') return;
    switch (intent.type) {
      case 'preview-frequency': {
        if (!documentState) return;
        try {
          const preview = applySessionChange(documentState.session, {
            type: 'set-frequency',
            frequencyHz: intent.frequencyHz,
          });
          previewFrequencyHz = intent.frequencyHz;
          applyLiveSession(preview);
          publish();
        } catch {
          return;
        }
        return;
      }
      case 'commit-frequency':
        previewFrequencyHz = null;
        applySession({
          type: 'set-frequency',
          frequencyHz: intent.frequencyHz,
        });
        requestProjectionIfNeeded();
        publish();
        return;
      case 'set-tinnitus-type':
        applySession({ type: intent.type, value: intent.value });
        return;
      case 'set-audibility':
        applySession({
          type: intent.type,
          frequencyHz: intent.frequencyHz,
          value: intent.value,
        });
        return;
      case 'set-master-gain':
        applySession({ type: intent.type, value: intent.value });
        return;
      case 'select-filter':
        playback.dispatch({ type: 'stop' });
        applySession({ type: intent.type, filterId: intent.filterId }, false);
        requestProjectionIfNeeded();
        publish();
        return;
      case 'set-white-noise-q':
      case 'set-cr-noise-level':
      case 'set-cr-notch-q':
        applySession({ type: intent.type, value: intent.value });
        return;
      case 'set-cr-notched-noise':
        applySession({ type: intent.type, value: intent.value });
        return;
      case 'set-hearing-correction':
        playback.dispatch({ type: 'stop' });
        applySession({ type: intent.type, value: intent.value }, false);
        return;
      case 'preview-matching-stimulus':
        if (documentState) {
          playback.dispatch({
            type: 'preview-matching-stimulus',
            match: documentState.session.tinnitusMatch,
            masterGain: documentState.session.masterGain,
          });
        }
        return;
      case 'preview-hearing-correction':
        if (documentState) {
          playback.dispatch({
            type: 'preview-hearing-correction',
            hearingCorrection: intent.value,
            masterGain: documentState.session.masterGain,
          });
        }
        return;
      case 'start-therapy':
        if (
          documentState &&
          getTherapySessionReadiness(documentState.session).ready
        ) {
          playback.dispatch({
            type: 'start-therapy',
            session: documentState.session,
          });
        }
        return;
      case 'pause-therapy':
        playback.dispatch({ type: 'pause' });
        return;
      case 'continue-therapy':
        playback.dispatch({ type: 'continue' });
        return;
      case 'stop-playback':
        playback.dispatch({ type: 'stop' });
        return;
      case 'retry-playback':
        playback.dispatch({
          type: 'retry',
          filterId: documentState?.session.selectedFilterId ?? null,
        });
        return;
      case 'create-preset': {
        if (!documentState) return;
        try {
          const preset = createTherapyPreset({
            id: createId(),
            name: intent.name,
            now: now(),
            session: documentState.session,
            existingPresets: availablePresets(documentState),
          });
          const candidate = updateWorkspaceDocument(documentState, {
            availablePresets: [...availablePresets(documentState), preset],
            loadedPresetId: preset.id,
          });
          commitPresetCandidate(candidate, 'preset-created');
        } catch (error) {
          notify(
            'error',
            error instanceof Error ? error.message : 'preset-error',
          );
          publish();
        }
        return;
      }
      case 'rename-preset': {
        if (!documentState) return;
        const preset = availablePreset(documentState, intent.id);
        if (!preset) return;
        try {
          const renamed = renameTherapyPreset(
            preset,
            intent.name,
            now(),
            availablePresets(documentState),
          );
          const presets = availablePresets(documentState).map(entry =>
            entry.id === renamed.id ? renamed : entry,
          );
          commitPresetCandidate(
            updateWorkspaceDocument(documentState, {
              availablePresets: presets,
            }),
            'preset-updated',
          );
        } catch (error) {
          notify(
            'error',
            error instanceof Error ? error.message : 'preset-error',
          );
          publish();
        }
        return;
      }
      case 'update-preset': {
        if (!documentState) return;
        const preset = availablePreset(documentState, intent.id);
        if (!preset) return;
        try {
          const updated = replaceTherapyPresetSnapshot(
            preset,
            documentState.session,
            now(),
          );
          const presets = availablePresets(documentState).map(entry =>
            entry.id === updated.id ? updated : entry,
          );
          commitPresetCandidate(
            updateWorkspaceDocument(documentState, {
              availablePresets: presets,
              loadedPresetId: updated.id,
            }),
            'preset-updated',
          );
        } catch (error) {
          notify(
            'error',
            error instanceof Error ? error.message : 'preset-error',
          );
          publish();
        }
        return;
      }
      case 'delete-preset': {
        if (!documentState) return;
        const entry = documentState.presetEntries.find(candidate =>
          candidate.kind === 'available'
            ? candidate.preset.id === intent.id
            : candidate.id === intent.id,
        );
        if (!entry) return;
        pendingConfirmation = {
          kind: 'delete-preset',
          id: createId(),
          originRevision: applicationRevision,
          presetId: intent.id,
          presetName:
            entry.kind === 'available' ? entry.preset.name : entry.name,
        };
        publish();
        return;
      }
      case 'confirm-delete-preset':
        if (
          pendingConfirmation?.kind === 'delete-preset' &&
          pendingConfirmation.id === intent.confirmationId &&
          pendingConfirmation.originRevision === intent.originRevision &&
          applicationRevision === intent.originRevision
        ) {
          const id = pendingConfirmation.presetId;
          pendingConfirmation = null;
          deletePresetNow(id);
        }
        return;
      case 'undo-delete-preset':
        if (!documentState || !deletedPreset) return;
        if (
          (deletedPreset.kind === 'available'
            ? deletedPreset.preset.id
            : deletedPreset.id) !== intent.id
        ) {
          return;
        }
        if (
          commitPresetCandidate(
            restoreWorkspaceDocumentPreset(documentState, deletedPreset),
            'preset-restored',
          )
        ) {
          deletedPreset = null;
          if (deletedPresetTimer !== null) clearTimeout(deletedPresetTimer);
          deletedPresetTimer = null;
        }
        return;
      case 'load-preset':
        requestLoadOrRevert(intent.id, 'load');
        return;
      case 'revert-preset':
        requestLoadOrRevert(intent.id, 'revert');
        return;
      case 'confirm-discard-preset-edits':
        if (
          pendingConfirmation?.kind === 'discard-preset-edits' &&
          pendingConfirmation.id === intent.confirmationId &&
          pendingConfirmation.originRevision === intent.originRevision &&
          applicationRevision === intent.originRevision
        ) {
          const id = pendingConfirmation.presetId;
          pendingConfirmation = null;
          loadPresetNow(id);
        }
        return;
      case 'confirm-am-projection':
        if (
          pendingConfirmation?.kind === 'am-projection' &&
          pendingConfirmation.id === intent.confirmationId &&
          pendingConfirmation.originRevision === intent.originRevision &&
          applicationRevision === intent.originRevision
        ) {
          pendingConfirmation = null;
          applySession({ type: 'confirm-am-projection' });
          notify('success', 'am-projection-applied');
          publish();
        }
        return;
      case 'resolve-storage-conflict':
        if (
          pendingConfirmation?.kind === 'storage-conflict' &&
          pendingConfirmation.id === intent.confirmationId &&
          pendingConfirmation.originRevision === intent.originRevision &&
          applicationRevision === intent.originRevision
        ) {
          resolveStorageConflict(intent.resolution);
        }
        return;
      case 'request-reset-local-data':
        if (phase === 'ready') {
          recoveryExpectedRevision = persistence.revision;
        }
        pendingConfirmation = {
          kind: 'reset-local-data',
          id: createId(),
          originRevision: applicationRevision,
        };
        publish();
        return;
      case 'confirm-reset-local-data':
        if (
          pendingConfirmation?.kind === 'reset-local-data' &&
          pendingConfirmation.id === intent.confirmationId &&
          pendingConfirmation.originRevision === intent.originRevision &&
          applicationRevision === intent.originRevision
        ) {
          resetLocalData();
        }
        return;
      case 'cancel-confirmation':
        if (pendingConfirmation?.id === intent.confirmationId) {
          pendingConfirmation = null;
          publish();
        }
        return;
      case 'download-recovery-data':
        if (recoveryRawValue !== null) downloadRecoveryData(recoveryRawValue);
        return;
      case 'retry-persistence':
        if (phase === 'recovery') initialize();
        else flushPersistence();
        return;
      case 'dismiss-notification':
        notifications = notifications.filter(item => item.id !== intent.id);
        publish();
        return;
    }
  }

  const unsubscribePlayback = playback.subscribe(() => publish());
  const handlePageHide = () => flushPersistence();
  pageLifecycle?.addEventListener('pagehide', handlePageHide);
  queueMicrotask(initialize);

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    readSpectrum(target) {
      return playback.readSpectrum(target);
    },
    async dispose() {
      if (disposed) return;
      flushPersistence();
      disposed = true;
      if (persistenceTimer !== null) clearTimeout(persistenceTimer);
      if (deletedPresetTimer !== null) clearTimeout(deletedPresetTimer);
      unsubscribeStore();
      unsubscribePlayback();
      pageLifecycle?.removeEventListener('pagehide', handlePageHide);
      listeners.clear();
      await playback.dispose();
    },
  };
}
