import type { TherapyFilterId, TherapySession } from '../model/types';
import type {
  SpectrumFrameMetadata,
  TherapyPlayback,
  TherapyPlaybackError,
  TherapyPlaybackIntent,
  TherapyPlaybackSnapshot,
  TherapyPlaybackSource,
} from './contracts';
import type {
  PlaybackSourceConfiguration,
  PlaybackSourceFactory,
  RunningPlaybackSource,
} from './sources/contracts';

const SPECTRUM_METADATA: SpectrumFrameMetadata = Object.freeze({
  sampleRate: 0,
  fftSize: 8_192,
  minDecibels: -100,
  maxDecibels: 0,
  smoothing: 0.8,
});

type SourceFactoryLoader = () => Promise<PlaybackSourceFactory>;

export interface TherapyPlaybackDependencies {
  readonly createContext: (options?: AudioContextOptions) => AudioContext;
  readonly loadMatchingStimulusFactory: SourceFactoryLoader;
  readonly loadTherapyFilterFactory: (
    filterId: TherapyFilterId,
  ) => Promise<PlaybackSourceFactory>;
  readonly transitionSeconds?: number;
}

interface SharedAudioGraph {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly analyser: AnalyserNode;
}

interface ActiveSource {
  readonly running: RunningPlaybackSource;
  readonly outputGain: GainNode;
  readonly factory: PlaybackSourceFactory;
  readonly snapshotSource: Exclude<TherapyPlaybackSource, { kind: 'none' }>;
  configuration: PlaybackSourceConfiguration;
}

interface CapturedGestureResume {
  readonly graph: SharedAudioGraph | null;
  readonly promise: Promise<void>;
}

function defaultDependencies(): TherapyPlaybackDependencies {
  return {
    createContext(options) {
      try {
        return new AudioContext(options);
      } catch (error) {
        if ((error as { name?: string }).name !== 'NotSupportedError')
          throw error;
        return new AudioContext();
      }
    },
    async loadMatchingStimulusFactory() {
      const module =
        await import('./sources/matching-stimulus/matching-stimulus-source');
      return module.matchingStimulusSourceFactory;
    },
    async loadTherapyFilterFactory(filterId) {
      if (filterId === 'white-noise') {
        const module = await import('./sources/white-noise/white-noise-source');
        return module.whiteNoiseSourceFactory;
      }

      const module =
        await import('./sources/decorrelating-am/decorrelating-am-source');
      return module.decorrelatingAMSourceFactory;
    },
    transitionSeconds: 0.03,
  };
}

function sourceForConfiguration(
  configuration: PlaybackSourceConfiguration,
): Exclude<TherapyPlaybackSource, { kind: 'none' }> {
  if (configuration.kind === 'matching-stimulus') {
    return { kind: 'matching-stimulus' };
  }
  if (configuration.kind === 'hearing-correction-preview') {
    return {
      kind: 'hearing-correction-preview',
      hearingCorrection: configuration.hearingCorrection,
    };
  }
  return { kind: 'therapy-filter', filterId: configuration.filterId };
}

function requiresExplicitRestart(
  previous: TherapySession,
  next: TherapySession,
): boolean {
  return (
    previous.selectedFilterId === 'decorrelating-am' &&
    previous.filterSettings['decorrelating-am'].hearingCorrection !==
      next.filterSettings['decorrelating-am'].hearingCorrection
  );
}

function isUserGestureError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'InvalidStateError';
}

function wait(seconds: number): Promise<void> {
  if (seconds <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, seconds * 1_000));
}

export function createTherapyPlayback(
  dependencyOverrides?: Partial<TherapyPlaybackDependencies>,
): TherapyPlayback {
  const dependencies = { ...defaultDependencies(), ...dependencyOverrides };
  const transitionSeconds = dependencies.transitionSeconds ?? 0.03;
  const listeners = new Set<(snapshot: TherapyPlaybackSnapshot) => void>();
  const filterFactoryCache = new Map<TherapyFilterId, PlaybackSourceFactory>();
  const unavailableFilters = new Set<TherapyFilterId>();
  let matchingFactory: PlaybackSourceFactory | null = null;
  let graph: SharedAudioGraph | null = null;
  let active: ActiveSource | null = null;
  let snapshot: TherapyPlaybackSnapshot = {
    status: 'stopped',
    source: { kind: 'none' },
    error: null,
    spectrum: SPECTRUM_METADATA,
  };
  let operationToken = 0;
  let pendingAbort: AbortController | null = null;
  let commandQueue = Promise.resolve();
  let disposed = false;
  let intentionalContextTransition = false;
  let pendingLiveSession: TherapySession | null = null;
  let liveUpdateScheduled = false;

  function publish(
    next: Partial<Omit<TherapyPlaybackSnapshot, 'spectrum'>>,
  ): void {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener(snapshot);
  }

  function enqueue(command: () => Promise<void>): void {
    commandQueue = commandQueue.then(command).catch(error => {
      if (disposed) return;
      publish({
        status: 'error',
        source: { kind: 'none' },
        error: {
          code: 'source-failed',
          filterId: null,
          recoverable: true,
          cause: error,
        },
      });
    });
  }

  function normalizeError(
    error: unknown,
    filterId: TherapyFilterId | null,
    contextFailure = false,
  ): TherapyPlaybackError {
    return {
      code: contextFailure
        ? 'audio-context-failed'
        : isUserGestureError(error)
          ? 'user-gesture-required'
          : filterId
            ? 'filter-unavailable'
            : 'source-failed',
      filterId,
      recoverable: true,
      cause: error,
    };
  }

  async function handleContextStateChange(): Promise<void> {
    if (!graph || intentionalContextTransition || disposed) return;

    const contextState = graph.context.state as string;
    if (
      (contextState === 'suspended' || contextState === 'interrupted') &&
      snapshot.status === 'playing' &&
      active?.snapshotSource.kind === 'therapy-filter'
    ) {
      publish({ status: 'paused' });
    } else if (
      (contextState === 'suspended' || contextState === 'interrupted') &&
      snapshot.status === 'previewing'
    ) {
      await stopActive(false);
    } else if (contextState === 'closed' && active) {
      const closedActive = active;
      active = null;
      await closedActive.running.dispose().catch(() => undefined);
      closedActive.outputGain.disconnect();
      publish({
        status: 'error',
        source: { kind: 'none' },
        error: normalizeError(
          new Error('AudioContext closed during playback'),
          closedActive.snapshotSource.kind === 'therapy-filter'
            ? closedActive.snapshotSource.filterId
            : null,
          true,
        ),
      });
    }
  }

  function ensureGraph(): SharedAudioGraph {
    if (graph && graph.context.state !== 'closed') return graph;

    const context = dependencies.createContext({ sampleRate: 44_100 });
    const masterGain = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = SPECTRUM_METADATA.fftSize;
    analyser.minDecibels = SPECTRUM_METADATA.minDecibels;
    analyser.maxDecibels = SPECTRUM_METADATA.maxDecibels;
    analyser.smoothingTimeConstant = SPECTRUM_METADATA.smoothing;
    masterGain.connect(analyser);
    analyser.connect(context.destination);
    context.onstatechange = () => enqueue(handleContextStateChange);
    graph = { context, masterGain, analyser };
    snapshot = {
      ...snapshot,
      spectrum: { ...SPECTRUM_METADATA, sampleRate: context.sampleRate },
    };
    return graph;
  }

  function captureGestureResume(): CapturedGestureResume {
    try {
      const capturedGraph = ensureGraph();
      const promise = capturedGraph.context.resume();
      void promise.catch(() => undefined);
      return { graph: capturedGraph, promise };
    } catch (error) {
      const promise = Promise.reject(error);
      void promise.catch(() => undefined);
      return { graph: null, promise };
    }
  }

  async function loadFactory(
    configuration: PlaybackSourceConfiguration,
  ): Promise<PlaybackSourceFactory> {
    if (configuration.kind !== 'therapy-filter') {
      matchingFactory ??= await dependencies.loadMatchingStimulusFactory();
      return matchingFactory;
    }

    const cached = filterFactoryCache.get(configuration.filterId);
    if (cached) return cached;
    const loaded = await dependencies.loadTherapyFilterFactory(
      configuration.filterId,
    );
    filterFactoryCache.set(configuration.filterId, loaded);
    return loaded;
  }

  async function stopActive(suspendContext: boolean): Promise<void> {
    const current = active;
    if (!current) {
      publish({ status: 'stopped', source: { kind: 'none' }, error: null });
      if (suspendContext && graph?.context.state === 'running') {
        intentionalContextTransition = true;
        await graph.context.suspend().catch(() => undefined);
        intentionalContextTransition = false;
      }
      return;
    }

    publish({ status: 'stopping', error: null });
    const now = graph?.context.currentTime ?? 0;
    current.outputGain.gain.cancelScheduledValues(now);
    current.outputGain.gain.setValueAtTime(current.outputGain.gain.value, now);
    current.outputGain.gain.linearRampToValueAtTime(0, now + transitionSeconds);
    await wait(transitionSeconds);
    if (active === current) active = null;
    await current.running.dispose().catch(() => undefined);
    current.outputGain.disconnect();

    if (suspendContext && graph?.context.state === 'running') {
      intentionalContextTransition = true;
      await graph.context.suspend().catch(() => undefined);
      intentionalContextTransition = false;
    }
    publish({ status: 'stopped', source: { kind: 'none' }, error: null });
  }

  async function start(
    token: number,
    configuration: PlaybackSourceConfiguration,
    masterGain: number,
    capturedResume: CapturedGestureResume,
  ): Promise<void> {
    if (disposed || token !== operationToken) return;
    const filterId =
      configuration.kind === 'therapy-filter' ? configuration.filterId : null;
    if (filterId && unavailableFilters.has(filterId)) {
      publish({
        status: 'error',
        source: { kind: 'none' },
        error: normalizeError(
          new Error('Therapy Filter is unavailable until Retry'),
          filterId,
        ),
      });
      return;
    }

    publish({
      status: 'starting',
      source: sourceForConfiguration(configuration),
      error: null,
    });

    if (active) await stopActive(false);
    if (disposed || token !== operationToken) return;

    const sharedGraph = capturedResume.graph;
    try {
      await capturedResume.promise;
      if (!sharedGraph) {
        throw new Error('AudioContext was not created');
      }
    } catch (error) {
      publish({
        status: 'error',
        source: { kind: 'none' },
        error: normalizeError(error, filterId, !isUserGestureError(error)),
      });
      return;
    }

    const abort = new AbortController();
    pendingAbort = abort;
    const outputGain = sharedGraph.context.createGain();
    outputGain.gain.value = 0;
    outputGain.connect(sharedGraph.masterGain);
    let running: RunningPlaybackSource | null = null;

    try {
      const factory = await loadFactory(configuration);
      abort.signal.throwIfAborted();
      running = await factory.create({
        context: sharedGraph.context,
        output: outputGain,
        configuration,
        signal: abort.signal,
      });
      if (abort.signal.aborted || token !== operationToken || disposed) {
        await running.dispose();
        outputGain.disconnect();
        return;
      }

      sharedGraph.masterGain.gain.setTargetAtTime(
        masterGain,
        sharedGraph.context.currentTime,
        0.01,
      );
      outputGain.gain.setValueAtTime(0, sharedGraph.context.currentTime);
      outputGain.gain.linearRampToValueAtTime(
        1,
        sharedGraph.context.currentTime + transitionSeconds,
      );
      active = {
        running,
        outputGain,
        factory,
        configuration,
        snapshotSource: sourceForConfiguration(configuration),
      };
      publish({
        status:
          configuration.kind === 'therapy-filter' ? 'playing' : 'previewing',
        source: sourceForConfiguration(configuration),
        error: null,
      });
    } catch (error) {
      if (running) await running.dispose().catch(() => undefined);
      outputGain.disconnect();
      if (abort.signal.aborted || token !== operationToken || disposed) return;
      if (filterId) unavailableFilters.add(filterId);
      if (sharedGraph.context.state === 'running') {
        intentionalContextTransition = true;
        await sharedGraph.context.suspend().catch(() => undefined);
        intentionalContextTransition = false;
      }
      publish({
        status: 'error',
        source: { kind: 'none' },
        error: normalizeError(error, filterId),
      });
    } finally {
      if (pendingAbort === abort) pendingAbort = null;
    }
  }

  async function replaceActiveSource(
    nextConfiguration: PlaybackSourceConfiguration,
  ): Promise<void> {
    const previous = active;
    if (!previous || !graph) return;
    const abort = new AbortController();
    pendingAbort = abort;
    const outputGain = graph.context.createGain();
    outputGain.gain.value = 0;
    outputGain.connect(graph.masterGain);

    try {
      const running = await previous.factory.create({
        context: graph.context,
        output: outputGain,
        configuration: nextConfiguration,
        signal: abort.signal,
      });
      if (abort.signal.aborted || active !== previous) {
        await running.dispose();
        outputGain.disconnect();
        return;
      }

      const now = graph.context.currentTime;
      outputGain.gain.setValueAtTime(0, now);
      outputGain.gain.linearRampToValueAtTime(1, now + transitionSeconds);
      previous.outputGain.gain.cancelScheduledValues(now);
      previous.outputGain.gain.setValueAtTime(
        previous.outputGain.gain.value,
        now,
      );
      previous.outputGain.gain.linearRampToValueAtTime(
        0,
        now + transitionSeconds,
      );
      active = {
        ...previous,
        running,
        outputGain,
        configuration: nextConfiguration,
      };
      await wait(transitionSeconds);
      await previous.running.dispose();
      previous.outputGain.disconnect();
    } catch (error) {
      outputGain.disconnect();
      await stopActive(false);
      const filterId =
        nextConfiguration.kind === 'therapy-filter'
          ? nextConfiguration.filterId
          : null;
      if (filterId) unavailableFilters.add(filterId);
      publish({
        status: 'error',
        source: { kind: 'none' },
        error: normalizeError(error, filterId),
      });
    } finally {
      if (pendingAbort === abort) pendingAbort = null;
    }
  }

  async function applyLiveSession(session: TherapySession): Promise<void> {
    if (!active || !graph) return;

    graph.masterGain.gain.setTargetAtTime(
      session.masterGain,
      graph.context.currentTime,
      0.01,
    );
    if (active.configuration.kind === 'matching-stimulus') {
      const nextConfiguration: PlaybackSourceConfiguration = {
        kind: 'matching-stimulus',
        match: session.tinnitusMatch,
      };
      const result = active.running.applyLiveConfiguration(nextConfiguration);
      if (result.kind === 'replace') {
        await replaceActiveSource(nextConfiguration);
      } else if (active) {
        active.configuration = nextConfiguration;
      }
      return;
    }
    if (active.configuration.kind === 'hearing-correction-preview') return;

    if (active.configuration.filterId !== session.selectedFilterId) {
      await stopActive(true);
      return;
    }

    if (requiresExplicitRestart(active.configuration.session, session)) {
      await stopActive(true);
      return;
    }

    const nextConfiguration: PlaybackSourceConfiguration = {
      kind: 'therapy-filter',
      filterId: session.selectedFilterId,
      session,
    };
    const result = active.running.applyLiveConfiguration(nextConfiguration);
    if (result.kind === 'replace') {
      await replaceActiveSource(nextConfiguration);
    } else if (active) {
      active.configuration = nextConfiguration;
    }
  }

  async function flushLiveSessions(): Promise<void> {
    try {
      while (pendingLiveSession) {
        const session = pendingLiveSession;
        pendingLiveSession = null;
        await applyLiveSession(session);
      }
    } finally {
      liveUpdateScheduled = false;
      if (pendingLiveSession) {
        liveUpdateScheduled = true;
        enqueue(flushLiveSessions);
      }
    }
  }

  function scheduleLiveSession(session: TherapySession): void {
    pendingLiveSession = session;
    if (liveUpdateScheduled) return;
    liveUpdateScheduled = true;
    enqueue(flushLiveSessions);
  }

  function dispatch(intent: TherapyPlaybackIntent): void {
    if (disposed) return;

    if (
      intent.type === 'start-therapy' ||
      intent.type === 'preview-matching-stimulus' ||
      intent.type === 'preview-hearing-correction' ||
      intent.type === 'stop'
    ) {
      operationToken += 1;
      pendingAbort?.abort(new DOMException('Superseded', 'AbortError'));
    }

    switch (intent.type) {
      case 'start-therapy': {
        const token = operationToken;
        const capturedResume = captureGestureResume();
        enqueue(() =>
          start(
            token,
            {
              kind: 'therapy-filter',
              filterId: intent.session.selectedFilterId,
              session: intent.session,
            },
            intent.session.masterGain,
            capturedResume,
          ),
        );
        break;
      }
      case 'preview-matching-stimulus': {
        const token = operationToken;
        const capturedResume = captureGestureResume();
        enqueue(() =>
          start(
            token,
            { kind: 'matching-stimulus', match: intent.match },
            intent.masterGain,
            capturedResume,
          ),
        );
        break;
      }
      case 'preview-hearing-correction': {
        const token = operationToken;
        const capturedResume = captureGestureResume();
        enqueue(() =>
          start(
            token,
            {
              kind: 'hearing-correction-preview',
              hearingCorrection: intent.hearingCorrection,
            },
            intent.masterGain,
            capturedResume,
          ),
        );
        break;
      }
      case 'apply-live-session':
        scheduleLiveSession(intent.session);
        break;
      case 'pause':
        enqueue(async () => {
          if (
            !graph ||
            !active ||
            snapshot.status !== 'playing' ||
            active.snapshotSource.kind !== 'therapy-filter'
          ) {
            return;
          }
          try {
            intentionalContextTransition = true;
            await graph.context.suspend();
            intentionalContextTransition = false;
            publish({ status: 'paused' });
          } catch (error) {
            intentionalContextTransition = false;
            publish({
              status: 'error',
              error: normalizeError(
                error,
                active.snapshotSource.kind === 'therapy-filter'
                  ? active.snapshotSource.filterId
                  : null,
                true,
              ),
            });
          }
        });
        break;
      case 'continue':
        if (!graph || !active || snapshot.status !== 'paused') break;
        {
          const capturedResume = captureGestureResume();
          enqueue(async () => {
            if (!graph || !active || snapshot.status !== 'paused') return;
            try {
              await capturedResume.promise;
              publish({ status: 'playing', error: null });
            } catch (error) {
              publish({
                status: 'paused',
                error: normalizeError(
                  error,
                  active.snapshotSource.kind === 'therapy-filter'
                    ? active.snapshotSource.filterId
                    : null,
                ),
              });
            }
          });
        }
        break;
      case 'stop': {
        const token = operationToken;
        enqueue(() =>
          token === operationToken ? stopActive(true) : Promise.resolve(),
        );
        break;
      }
      case 'retry':
        if (intent.filterId) unavailableFilters.delete(intent.filterId);
        publish({ status: active ? snapshot.status : 'stopped', error: null });
        break;
    }
  }

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
      if (
        graph &&
        (snapshot.status === 'playing' || snapshot.status === 'previewing')
      ) {
        graph.analyser.getFloatFrequencyData(
          target as Float32Array<ArrayBuffer>,
        );
      } else {
        target.fill(snapshot.spectrum.minDecibels);
      }
      return snapshot.spectrum;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      operationToken += 1;
      pendingLiveSession = null;
      pendingAbort?.abort(new DOMException('Disposed', 'AbortError'));
      await commandQueue;
      if (active) {
        const current = active;
        active = null;
        await current.running.dispose().catch(() => undefined);
        current.outputGain.disconnect();
      }
      if (graph && graph.context.state !== 'closed') {
        graph.context.onstatechange = null;
        await graph.context.close().catch(() => undefined);
      }
      graph = null;
      listeners.clear();
      publish({ status: 'stopped', source: { kind: 'none' }, error: null });
    },
  };
}
