import type {
  PlaybackSourceConfiguration,
  PlaybackSourceFactory,
  RunningPlaybackSource,
} from '../contracts';
import { createRandomNoiseBuffer } from '../random-noise-buffer';

function assertWhiteNoiseConfiguration(
  configuration: PlaybackSourceConfiguration,
): asserts configuration is PlaybackSourceConfiguration & {
  readonly kind: 'therapy-filter';
  readonly filterId: 'white-noise';
} {
  if (
    configuration.kind !== 'therapy-filter' ||
    configuration.filterId !== 'white-noise'
  ) {
    throw new TypeError('Expected White Noise configuration');
  }
}

export const whiteNoiseSourceFactory: PlaybackSourceFactory = {
  capabilities: {
    liveFrequency: true,
    liveMasterGain: true,
    liveFilterSettings: false,
  },
  async create(request): Promise<RunningPlaybackSource> {
    assertWhiteNoiseConfiguration(request.configuration);
    request.signal.throwIfAborted();

    const { context, output } = request;
    const initialConfiguration = request.configuration;
    const source = context.createBufferSource();
    const notch = context.createBiquadFilter();
    source.buffer = createRandomNoiseBuffer(context);
    source.loop = true;
    notch.type = 'notch';
    notch.frequency.value =
      initialConfiguration.session.tinnitusMatch.frequencyHz;
    notch.Q.value =
      initialConfiguration.session.filterSettings['white-noise'].q;
    source.connect(notch);
    notch.connect(output);
    source.start();
    let disposed = false;

    return {
      applyLiveConfiguration(configuration) {
        assertWhiteNoiseConfiguration(configuration);
        const previousSettings =
          initialConfiguration.session.filterSettings['white-noise'];
        const nextSettings =
          configuration.session.filterSettings['white-noise'];
        if (nextSettings.q !== previousSettings.q) {
          return { kind: 'replace' };
        }

        notch.frequency.setTargetAtTime(
          configuration.session.tinnitusMatch.frequencyHz,
          context.currentTime,
          0.01,
        );
        return { kind: 'applied' };
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        source.stop();
        source.disconnect();
        notch.disconnect();
      },
    };
  },
};
