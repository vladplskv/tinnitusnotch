import type {
  TherapyFilterId,
  TherapySession,
  TinnitusMatch,
} from '../../model/types';

export type PlaybackSourceConfiguration =
  | {
      readonly kind: 'matching-stimulus';
      readonly match: TinnitusMatch;
    }
  | {
      readonly kind: 'therapy-filter';
      readonly filterId: TherapyFilterId;
      readonly session: TherapySession;
    };

export interface PlaybackSourceCapabilities {
  readonly liveFrequency: boolean;
  readonly liveMasterGain: boolean;
  readonly liveFilterSettings: boolean;
}

export interface PlaybackSourceCreateRequest {
  readonly context: AudioContext;
  readonly output: AudioNode;
  readonly configuration: PlaybackSourceConfiguration;
  readonly signal: AbortSignal;
}

export type PlaybackSourceUpdateResult =
  | { readonly kind: 'applied' }
  | { readonly kind: 'replace' };

export interface RunningPlaybackSource {
  applyLiveConfiguration(
    configuration: PlaybackSourceConfiguration,
  ): PlaybackSourceUpdateResult;
  dispose(): Promise<void>;
}

export interface PlaybackSourceFactory {
  readonly capabilities: PlaybackSourceCapabilities;
  create(request: PlaybackSourceCreateRequest): Promise<RunningPlaybackSource>;
}
