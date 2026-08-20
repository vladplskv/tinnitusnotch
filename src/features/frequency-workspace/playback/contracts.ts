import type {
  TherapyFilterId,
  TherapySession,
  TinnitusMatch,
} from '../model/types';

export type TherapyPlaybackStatus =
  | 'stopped'
  | 'starting'
  | 'previewing'
  | 'playing'
  | 'stopping'
  | 'paused'
  | 'error';

export type TherapyPlaybackErrorCode =
  | 'user-gesture-required'
  | 'filter-unavailable'
  | 'audio-context-failed'
  | 'source-failed';

export interface TherapyPlaybackError {
  readonly code: TherapyPlaybackErrorCode;
  readonly filterId: TherapyFilterId | null;
  readonly recoverable: boolean;
  readonly cause: unknown;
}

export interface SpectrumFrameMetadata {
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly minDecibels: number;
  readonly maxDecibels: number;
  readonly smoothing: number;
}

export type TherapyPlaybackSource =
  | { readonly kind: 'none' }
  | { readonly kind: 'matching-stimulus' }
  | {
      readonly kind: 'therapy-filter';
      readonly filterId: TherapyFilterId;
    };

export interface TherapyPlaybackSnapshot {
  readonly status: TherapyPlaybackStatus;
  readonly source: TherapyPlaybackSource;
  readonly error: TherapyPlaybackError | null;
  readonly spectrum: SpectrumFrameMetadata;
}

export type TherapyPlaybackIntent =
  | {
      readonly type: 'preview-matching-stimulus';
      readonly match: TinnitusMatch;
      readonly masterGain: number;
    }
  | { readonly type: 'start-therapy'; readonly session: TherapySession }
  | { readonly type: 'apply-live-session'; readonly session: TherapySession }
  | { readonly type: 'pause' }
  | { readonly type: 'continue' }
  | { readonly type: 'stop' }
  | { readonly type: 'retry'; readonly filterId: TherapyFilterId | null };

export interface TherapyPlayback {
  getSnapshot(): TherapyPlaybackSnapshot;
  subscribe(listener: (snapshot: TherapyPlaybackSnapshot) => void): () => void;
  dispatch(intent: TherapyPlaybackIntent): void;
  readSpectrum(target: Float32Array): SpectrumFrameMetadata;
  dispose(): Promise<void>;
}
