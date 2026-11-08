import workletUrl from '../../worklets/decorrelating-am-processor.worklet.ts?worker&url';
import { resolvePaper2025V1ActiveBand } from '../../dsp/active-band';
import { PAPER_2025_V1_CONTRACT } from '../../dsp/paper-2025-v1';
import type {
  PlaybackSourceConfiguration,
  PlaybackSourceFactory,
  RunningPlaybackSource,
} from '../contracts';

const loadedContexts = new WeakSet<AudioContext>();

function assertAMConfiguration(
  configuration: PlaybackSourceConfiguration,
): asserts configuration is PlaybackSourceConfiguration & {
  readonly kind: 'therapy-filter';
  readonly filterId: 'decorrelating-am';
} {
  if (
    configuration.kind !== 'therapy-filter' ||
    configuration.filterId !== 'decorrelating-am'
  ) {
    throw new TypeError('Expected De-correlating AM configuration');
  }
}

function createSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

function getResolvedConfiguration(
  configuration: PlaybackSourceConfiguration & {
    readonly kind: 'therapy-filter';
    readonly filterId: 'decorrelating-am';
  },
) {
  const settings = configuration.session.filterSettings['decorrelating-am'];
  if (
    settings.confirmedProjectionHz === null ||
    settings.hearingCorrection === null
  ) {
    throw new TypeError('De-correlating AM is not fully configured');
  }

  const resolution = resolvePaper2025V1ActiveBand(
    configuration.session.tinnitusMatch,
    settings.confirmedProjectionHz,
  );
  if (resolution.kind === 'unavailable') {
    throw new TypeError(`De-correlating AM unavailable: ${resolution.reason}`);
  }

  return {
    activeBandHz: resolution.bandHz,
    hearingCorrection: settings.hearingCorrection,
  };
}

async function waitUntilReady(
  node: AudioWorkletNode,
  signal: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    function cleanup() {
      signal.removeEventListener('abort', handleAbort);
      node.port.removeEventListener('message', handleMessage);
      node.removeEventListener('processorerror', handleProcessorError);
    }

    function handleAbort() {
      cleanup();
      reject(signal.reason);
    }

    function handleProcessorError() {
      cleanup();
      reject(new Error('De-correlating AM AudioWorklet processor failed'));
    }

    function handleMessage(event: MessageEvent<unknown>) {
      const message = event.data as { type?: string; message?: string } | null;
      if (message?.type === 'ready') {
        cleanup();
        resolve();
      } else if (message?.type === 'error') {
        cleanup();
        reject(
          new Error(message.message ?? 'De-correlating AM processor failed'),
        );
      }
    }

    signal.addEventListener('abort', handleAbort, { once: true });
    node.port.addEventListener('message', handleMessage);
    node.addEventListener('processorerror', handleProcessorError, {
      once: true,
    });
    node.port.start();
  });
}

export const decorrelatingAMSourceFactory: PlaybackSourceFactory = {
  capabilities: {
    liveFrequency: false,
    liveMasterGain: true,
    liveFilterSettings: false,
  },
  async create(request): Promise<RunningPlaybackSource> {
    assertAMConfiguration(request.configuration);
    request.signal.throwIfAborted();

    const resolved = getResolvedConfiguration(request.configuration);
    if (!loadedContexts.has(request.context)) {
      await request.context.audioWorklet.addModule(workletUrl);
      loadedContexts.add(request.context);
    }
    request.signal.throwIfAborted();

    const node = new AudioWorkletNode(
      request.context,
      'decorrelating-am-paper-2025-v1',
      {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          contractVersion: PAPER_2025_V1_CONTRACT,
          activeBandHz: resolved.activeBandHz,
          hearingCorrection: resolved.hearingCorrection,
          seed: createSeed(),
        },
      },
    );

    try {
      await waitUntilReady(node, request.signal);
      request.signal.throwIfAborted();
    } catch (error) {
      node.port.close();
      node.disconnect();
      throw error;
    }
    node.connect(request.output);
    let disposed = false;

    return {
      applyLiveConfiguration(configuration) {
        assertAMConfiguration(configuration);
        const next = getResolvedConfiguration(configuration);
        if (
          next.hearingCorrection !== resolved.hearingCorrection ||
          next.activeBandHz[0] !== resolved.activeBandHz[0] ||
          next.activeBandHz[1] !== resolved.activeBandHz[1]
        ) {
          return { kind: 'replace' };
        }

        return { kind: 'applied' };
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        node.port.close();
        node.disconnect();
      },
    };
  },
};
