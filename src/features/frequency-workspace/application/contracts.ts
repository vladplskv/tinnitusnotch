import type {
  Audibility,
  HearingCorrectionId,
  TherapyFilterDescription,
  TherapyFilterId,
  TherapyPreset,
  TherapySession,
  TinnitusType,
} from '../model/types';
import type {
  SpectrumFrameMetadata,
  TherapyPlaybackSnapshot,
} from '../playback/contracts';

export type WorkspacePhase = 'booting' | 'ready' | 'recovery';

export type WorkspaceErrorCode =
  | 'storage-unavailable'
  | 'revision-conflict'
  | 'user-gesture-required'
  | 'filter-unavailable'
  | 'audio-context-failed'
  | 'visualization-failed';

export interface WorkspaceNotification {
  readonly id: string;
  readonly kind: 'success' | 'warning' | 'error' | 'status';
  readonly code: string;
  readonly field: string | null;
}

export interface WorkspaceCapabilities {
  readonly canEdit: boolean;
  readonly canPreviewMatchingStimulus: boolean;
  readonly canPreviewHearingCorrection: boolean;
  readonly canStart: boolean;
  readonly canPause: boolean;
  readonly canContinue: boolean;
  readonly canStop: boolean;
  readonly canSavePreset: boolean;
  readonly canLoadPreset: boolean;
}

export interface WorkspacePersistenceSnapshot {
  readonly status:
    | 'idle'
    | 'saving'
    | 'saved'
    | 'unavailable'
    | 'conflict'
    | 'recovery';
  readonly revision: number | null;
  readonly dirty: boolean;
  readonly errorCode: WorkspaceErrorCode | null;
}

export type WorkspacePresetEntry =
  | {
      readonly kind: 'available';
      readonly preset: TherapyPreset;
    }
  | {
      readonly kind: 'unavailable';
      readonly id: string;
      readonly name: string;
      readonly updatedAt: number;
      readonly reason: 'unknown-filter' | 'newer-version' | 'invalid-data';
    };

export type PendingWorkspaceConfirmation =
  | {
      readonly kind: 'am-projection';
      readonly id: string;
      readonly originRevision: number;
      readonly exactFrequencyHz: number;
      readonly projectedFrequencyHz: number;
    }
  | {
      readonly kind: 'storage-conflict';
      readonly id: string;
      readonly originRevision: number;
      readonly externalRevision: number;
    }
  | {
      readonly kind: 'reset-local-data';
      readonly id: string;
      readonly originRevision: number;
    };

export interface WorkspaceSnapshot {
  readonly phase: WorkspacePhase;
  readonly session: TherapySession | null;
  readonly previewFrequencyHz: number | null;
  readonly filters: readonly TherapyFilterDescription[];
  readonly selectedFilter: TherapyFilterDescription | null;
  readonly presets: readonly WorkspacePresetEntry[];
  readonly loadedPresetId: string | null;
  readonly dirtyPresetId: string | null;
  readonly playback: TherapyPlaybackSnapshot;
  readonly persistence: WorkspacePersistenceSnapshot;
  readonly pendingConfirmation: PendingWorkspaceConfirmation | null;
  readonly capabilities: WorkspaceCapabilities;
  readonly notifications: readonly WorkspaceNotification[];
}

export type WorkspaceIntent =
  | { readonly type: 'preview-frequency'; readonly frequencyHz: number }
  | { readonly type: 'commit-frequency'; readonly frequencyHz: number }
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
  | { readonly type: 'preview-matching-stimulus' }
  | {
      readonly type: 'preview-hearing-correction';
      readonly value: HearingCorrectionId;
    }
  | { readonly type: 'start-therapy' }
  | { readonly type: 'pause-therapy' }
  | { readonly type: 'continue-therapy' }
  | { readonly type: 'stop-playback' }
  | { readonly type: 'retry-playback' }
  | { readonly type: 'create-preset'; readonly name: string }
  | {
      readonly type: 'rename-preset';
      readonly id: string;
      readonly name: string;
    }
  | { readonly type: 'update-preset'; readonly id: string }
  | { readonly type: 'delete-preset'; readonly id: string }
  | { readonly type: 'undo-delete-preset'; readonly id: string }
  | { readonly type: 'load-preset'; readonly id: string }
  | { readonly type: 'revert-preset'; readonly id: string }
  | {
      readonly type: 'confirm-am-projection';
      readonly confirmationId: string;
      readonly originRevision: number;
    }
  | {
      readonly type: 'resolve-storage-conflict';
      readonly confirmationId: string;
      readonly originRevision: number;
      readonly resolution: 'load-external' | 'overwrite-local';
    }
  | { readonly type: 'request-reset-local-data' }
  | {
      readonly type: 'confirm-reset-local-data';
      readonly confirmationId: string;
      readonly originRevision: number;
    }
  | { readonly type: 'cancel-confirmation'; readonly confirmationId: string }
  | { readonly type: 'download-recovery-data' }
  | { readonly type: 'retry-persistence' }
  | { readonly type: 'dismiss-notification'; readonly id: string };

export interface FrequencyWorkspace {
  getSnapshot(): WorkspaceSnapshot;
  subscribe(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
  dispatch(intent: WorkspaceIntent): void;
  readSpectrum(target: Float32Array): SpectrumFrameMetadata;
  dispose(): Promise<void>;
}
