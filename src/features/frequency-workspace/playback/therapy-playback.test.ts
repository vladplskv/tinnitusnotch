import type { TherapySession, TinnitusMatch } from '../model/types';
import { describe, expect, it, vi } from 'vitest';

import type {
  PlaybackSourceFactory,
  RunningPlaybackSource,
} from './sources/contracts';
import {
  createTherapyPlayback,
  type TherapyPlaybackDependencies,
} from './therapy-playback';

const MATCH: TinnitusMatch = {
  frequencyHz: 4_000,
  type: 'tone',
  audibilityByFrequencyHz: {},
};

const SESSION: TherapySession = {
  tinnitusMatch: MATCH,
  masterGain: 0.1,
  selectedFilterId: 'white-noise',
  filterSettings: {
    'white-noise': { q: 1 },
    'decorrelating-am': {
      hearingCorrection: null,
      confirmedProjectionHz: null,
    },
  },
};

class FakeAudioParam {
  value = 0;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
  linearRampToValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
  setTargetAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
}

class FakeAudioNode {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 0;
  minDecibels = 0;
  maxDecibels = 0;
  smoothingTimeConstant = 0;
  getFloatFrequencyData = vi.fn((target: Float32Array) => target.fill(-42));
}

class FakeAudioContext {
  readonly destination = new FakeAudioNode();
  readonly sampleRate = 44_100;
  readonly gains: FakeGainNode[] = [];
  readonly analyser = new FakeAnalyserNode();
  currentTime = 0;
  state: AudioContextState = 'suspended';
  onstatechange: ((event: Event) => unknown) | null = null;
  resume = vi.fn(async () => {
    this.state = 'running';
    this.onstatechange?.(new Event('statechange'));
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
    this.onstatechange?.(new Event('statechange'));
  });
  close = vi.fn(async () => {
    this.state = 'closed';
    this.onstatechange?.(new Event('statechange'));
  });
  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }
  createAnalyser() {
    return this.analyser;
  }
}

function dependencies(
  context: FakeAudioContext,
  factory: PlaybackSourceFactory,
): TherapyPlaybackDependencies {
  return {
    createContext: () => context as unknown as AudioContext,
    loadMatchingStimulusFactory: async () => factory,
    loadTherapyFilterFactory: async () => factory,
    transitionSeconds: 0,
  };
}

async function waitForStatus(
  playback: ReturnType<typeof createTherapyPlayback>,
  expected: string,
) {
  if (playback.getSnapshot().status === expected) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${expected}`)),
      500,
    );
    const unsubscribe = playback.subscribe(snapshot => {
      if (snapshot.status === expected) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

describe('Therapy Playback', () => {
  it('previews a Hearing Correction sequence through the same shared graph', async () => {
    const context = new FakeAudioContext();
    const source: RunningPlaybackSource = {
      applyLiveConfiguration: vi.fn(() => ({ kind: 'replace' as const })),
      dispose: vi.fn(async () => undefined),
    };
    const factory: PlaybackSourceFactory = {
      capabilities: {
        liveFrequency: false,
        liveMasterGain: true,
        liveFilterSettings: false,
      },
      create: vi.fn(async () => source),
    };
    const playback = createTherapyPlayback(dependencies(context, factory));

    playback.dispatch({
      type: 'preview-hearing-correction',
      hearingCorrection: 'c1',
      masterGain: 0.1,
    });
    await waitForStatus(playback, 'previewing');

    expect(playback.getSnapshot().source).toEqual({
      kind: 'hearing-correction-preview',
      hearingCorrection: 'c1',
    });
    expect(factory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: {
          kind: 'hearing-correction-preview',
          hearingCorrection: 'c1',
        },
      }),
    );
    await playback.dispose();
  });

  it('owns the shared output lifecycle and returns post-master spectrum only while playing', async () => {
    const context = new FakeAudioContext();
    const source: RunningPlaybackSource = {
      applyLiveConfiguration: vi.fn(() => ({ kind: 'applied' as const })),
      dispose: vi.fn(async () => undefined),
    };
    const factory: PlaybackSourceFactory = {
      capabilities: {
        liveFrequency: true,
        liveMasterGain: true,
        liveFilterSettings: false,
      },
      create: vi.fn(async () => source),
    };
    const playback = createTherapyPlayback(dependencies(context, factory));

    playback.dispatch({ type: 'start-therapy', session: SESSION });
    await waitForStatus(playback, 'playing');

    expect(playback.getSnapshot().source).toEqual({
      kind: 'therapy-filter',
      filterId: 'white-noise',
    });
    const playingSpectrum = new Float32Array(4);
    playback.readSpectrum(playingSpectrum);
    expect([...playingSpectrum]).toEqual([-42, -42, -42, -42]);

    playback.dispatch({ type: 'stop' });
    await waitForStatus(playback, 'stopped');

    const stoppedSpectrum = new Float32Array(4);
    playback.readSpectrum(stoppedSpectrum);
    expect([...stoppedSpectrum]).toEqual([-100, -100, -100, -100]);
    expect(source.dispose).toHaveBeenCalledOnce();
    expect(context.suspend).toHaveBeenCalledOnce();

    await playback.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('disposes a stale source when Stop overtakes asynchronous startup', async () => {
    const context = new FakeAudioContext();
    let finishCreation!: (source: RunningPlaybackSource) => void;
    const source: RunningPlaybackSource = {
      applyLiveConfiguration: vi.fn(() => ({ kind: 'applied' as const })),
      dispose: vi.fn(async () => undefined),
    };
    const factory: PlaybackSourceFactory = {
      capabilities: {
        liveFrequency: false,
        liveMasterGain: true,
        liveFilterSettings: false,
      },
      create: vi.fn(
        () =>
          new Promise<RunningPlaybackSource>(resolve => {
            finishCreation = resolve;
          }),
      ),
    };
    const playback = createTherapyPlayback(dependencies(context, factory));

    playback.dispatch({ type: 'start-therapy', session: SESSION });
    await waitForStatus(playback, 'starting');
    await vi.waitFor(() => expect(factory.create).toHaveBeenCalledOnce());
    playback.dispatch({ type: 'stop' });
    finishCreation(source);
    await waitForStatus(playback, 'stopped');

    expect(source.dispose).toHaveBeenCalledOnce();
    expect(playback.getSnapshot().source).toEqual({ kind: 'none' });
    await playback.dispose();
  });

  it('pauses and explicitly continues without recreating the active graph', async () => {
    const context = new FakeAudioContext();
    const source: RunningPlaybackSource = {
      applyLiveConfiguration: vi.fn(() => ({ kind: 'applied' as const })),
      dispose: vi.fn(async () => undefined),
    };
    const factory: PlaybackSourceFactory = {
      capabilities: {
        liveFrequency: true,
        liveMasterGain: true,
        liveFilterSettings: false,
      },
      create: vi.fn(async () => source),
    };
    const playback = createTherapyPlayback(dependencies(context, factory));

    playback.dispatch({ type: 'start-therapy', session: SESSION });
    await waitForStatus(playback, 'playing');
    playback.dispatch({ type: 'pause' });
    await waitForStatus(playback, 'paused');
    playback.dispatch({ type: 'continue' });
    await waitForStatus(playback, 'playing');

    expect(factory.create).toHaveBeenCalledOnce();
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledTimes(2);
    await playback.dispose();
  });

  it('crossfades a source replacement without ending logical playback', async () => {
    const context = new FakeAudioContext();
    const firstSource: RunningPlaybackSource = {
      applyLiveConfiguration: vi.fn(() => ({ kind: 'replace' as const })),
      dispose: vi.fn(async () => undefined),
    };
    const secondSource: RunningPlaybackSource = {
      applyLiveConfiguration: vi.fn(() => ({ kind: 'applied' as const })),
      dispose: vi.fn(async () => undefined),
    };
    const factory: PlaybackSourceFactory = {
      capabilities: {
        liveFrequency: false,
        liveMasterGain: true,
        liveFilterSettings: false,
      },
      create: vi
        .fn<PlaybackSourceFactory['create']>()
        .mockResolvedValueOnce(firstSource)
        .mockResolvedValueOnce(secondSource),
    };
    const playback = createTherapyPlayback(dependencies(context, factory));
    const amSession: TherapySession = {
      ...SESSION,
      selectedFilterId: 'decorrelating-am',
      filterSettings: {
        ...SESSION.filterSettings,
        'decorrelating-am': {
          hearingCorrection: 'a1',
          confirmedProjectionHz: 4_000,
        },
      },
    };

    playback.dispatch({ type: 'start-therapy', session: amSession });
    await waitForStatus(playback, 'playing');
    playback.dispatch({
      type: 'apply-live-session',
      session: {
        ...amSession,
        tinnitusMatch: { ...MATCH, frequencyHz: 4_800 },
        filterSettings: {
          ...amSession.filterSettings,
          'decorrelating-am': {
            hearingCorrection: 'a1',
            confirmedProjectionHz: 4_800,
          },
        },
      },
    });
    await vi.waitFor(() => expect(factory.create).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(firstSource.dispose).toHaveBeenCalledOnce());

    expect(playback.getSnapshot().status).toBe('playing');
    expect(playback.getSnapshot().source).toEqual({
      kind: 'therapy-filter',
      filterId: 'decorrelating-am',
    });
    await playback.dispose();
    expect(secondSource.dispose).toHaveBeenCalledOnce();
  });

  it('isolates a failed Therapy Filter until explicit Retry', async () => {
    const context = new FakeAudioContext();
    const recoveredSource: RunningPlaybackSource = {
      applyLiveConfiguration: vi.fn(() => ({ kind: 'applied' as const })),
      dispose: vi.fn(async () => undefined),
    };
    const factory: PlaybackSourceFactory = {
      capabilities: {
        liveFrequency: true,
        liveMasterGain: true,
        liveFilterSettings: false,
      },
      create: vi
        .fn<PlaybackSourceFactory['create']>()
        .mockRejectedValueOnce(new Error('adapter load failed'))
        .mockResolvedValueOnce(recoveredSource),
    };
    const playback = createTherapyPlayback(dependencies(context, factory));

    playback.dispatch({ type: 'start-therapy', session: SESSION });
    await waitForStatus(playback, 'error');
    expect(playback.getSnapshot().error).toMatchObject({
      code: 'filter-unavailable',
      filterId: 'white-noise',
      recoverable: true,
    });

    playback.dispatch({ type: 'start-therapy', session: SESSION });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(factory.create).toHaveBeenCalledOnce();

    playback.dispatch({ type: 'retry', filterId: 'white-noise' });
    playback.dispatch({ type: 'start-therapy', session: SESSION });
    await waitForStatus(playback, 'playing');
    expect(factory.create).toHaveBeenCalledTimes(2);
    await playback.dispose();
  });
});
