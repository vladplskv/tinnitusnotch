import workletUrl from '../../worklets/cr-neuromodulation-processor.worklet.ts?worker&url';
import { createRandomNoiseBuffer } from '../random-noise-buffer';
import type {
  PlaybackSourceConfiguration,
  PlaybackSourceFactory,
  RunningPlaybackSource,
} from '../contracts';

const loadedContexts = new WeakSet<AudioContext>();

function assertCRConfiguration(
  configuration: PlaybackSourceConfiguration,
): asserts configuration is PlaybackSourceConfiguration & {
  readonly kind: 'therapy-filter';
  readonly filterId: 'cr-neuromodulation';
} {
  if (
    configuration.kind !== 'therapy-filter' ||
    configuration.filterId !== 'cr-neuromodulation'
  ) {
    throw new TypeError('Expected CR Neuromodulation configuration');
  }
}

type CRConfiguration = PlaybackSourceConfiguration & {
  readonly kind: 'therapy-filter';
  readonly filterId: 'cr-neuromodulation';
};

/* The notched noise is always running; switching it off only mutes it. */
function noiseGain(configuration: CRConfiguration): number {
  const settings = configuration.session.filterSettings['cr-neuromodulation'];
  return settings.notchedNoise ? settings.noiseLevel : 0;
}

function createSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
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
      reject(new Error('CR Neuromodulation AudioWorklet processor failed'));
    }

    function handleMessage(event: MessageEvent<unknown>) {
      const message = event.data as { type?: string; message?: string } | null;
      if (message?.type === 'ready') {
        cleanup();
        resolve();
      } else if (message?.type === 'error') {
        cleanup();
        reject(
          new Error(message.message ?? 'CR Neuromodulation processor failed'),
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

export const crNeuromodulationSourceFactory: PlaybackSourceFactory = {
  capabilities: {
    liveFrequency: true,
    liveMasterGain: true,
    liveFilterSettings: false,
  },
  async create(request): Promise<RunningPlaybackSource> {
    assertCRConfiguration(request.configuration);
    request.signal.throwIfAborted();

    if (!loadedContexts.has(request.context)) {
      await request.context.audioWorklet.addModule(workletUrl);
      loadedContexts.add(request.context);
    }
    request.signal.throwIfAborted();

    const node = new AudioWorkletNode(request.context, 'cr-neuromodulation', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        tinnitusFrequencyHz:
          request.configuration.session.tinnitusMatch.frequencyHz,
        seed: createSeed(),
      },
    });

    try {
      await waitUntilReady(node, request.signal);
      request.signal.throwIfAborted();
    } catch (error) {
      node.port.close();
      node.disconnect();
      throw error;
    }
    node.connect(request.output);

    const { context } = request;
    const initial = request.configuration;
    const noise = context.createBufferSource();
    const notch = context.createBiquadFilter();
    const level = context.createGain();
    noise.buffer = createRandomNoiseBuffer(context);
    noise.loop = true;
    notch.type = 'notch';
    notch.frequency.value = initial.session.tinnitusMatch.frequencyHz;
    notch.Q.value = initial.session.filterSettings['cr-neuromodulation'].notchQ;
    level.gain.value = noiseGain(initial);
    noise.connect(notch).connect(level).connect(request.output);
    noise.start();
    let disposed = false;

    return {
      applyLiveConfiguration(configuration) {
        assertCRConfiguration(configuration);
        const { session } = configuration;
        node.port.postMessage({
          type: 'set-tinnitus-frequency',
          frequencyHz: session.tinnitusMatch.frequencyHz,
        });
        const now = context.currentTime;
        notch.frequency.setTargetAtTime(
          session.tinnitusMatch.frequencyHz,
          now,
          0.01,
        );
        notch.Q.setTargetAtTime(
          session.filterSettings['cr-neuromodulation'].notchQ,
          now,
          0.01,
        );
        level.gain.setTargetAtTime(noiseGain(configuration), now, 0.02);
        return { kind: 'applied' };
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        node.port.close();
        node.disconnect();
        noise.stop();
        noise.disconnect();
        notch.disconnect();
        level.disconnect();
      },
    };
  },
};
