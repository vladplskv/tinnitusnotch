import type { FrequencyWorkspace, WorkspaceSnapshot } from './contracts';

const BOOTING_SNAPSHOT: WorkspaceSnapshot = Object.freeze({
  phase: 'booting',
  session: null,
  previewFrequencyHz: null,
  selectedFilter: null,
  presets: Object.freeze([]),
  dirtyPresetId: null,
  playback: Object.freeze({
    status: 'stopped',
    source: Object.freeze({ kind: 'none' }),
    error: null,
    spectrum: Object.freeze({
      sampleRate: 0,
      fftSize: 8192,
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
    canStart: false,
    canPause: false,
    canContinue: false,
    canStop: false,
    canSavePreset: false,
    canLoadPreset: false,
  }),
  notifications: Object.freeze([]),
});

export function createFrequencyWorkspace(): FrequencyWorkspace {
  const listeners = new Set<(snapshot: WorkspaceSnapshot) => void>();
  let disposed = false;

  return {
    getSnapshot() {
      return BOOTING_SNAPSHOT;
    },
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }

      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch() {
      // Wave zero exposes a safe, disabled shell. Application behavior lands
      // after model, persistence, and playback adapters satisfy their seams.
    },
    readSpectrum(target) {
      target.fill(BOOTING_SNAPSHOT.playback.spectrum.minDecibels);
      return BOOTING_SNAPSHOT.playback.spectrum;
    },
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      listeners.clear();
    },
  };
}
