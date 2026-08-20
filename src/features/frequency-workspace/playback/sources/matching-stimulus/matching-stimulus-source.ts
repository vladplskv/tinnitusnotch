import type {
  PlaybackSourceConfiguration,
  PlaybackSourceFactory,
  RunningPlaybackSource,
} from '../contracts';
import { TINNITUS_MATCH_FREQUENCIES_HZ } from '../../dsp/active-band';
import { getPaper2025V1HearingGain } from '../../dsp/paper-2025-v1';
import { createRandomNoiseBuffer } from '../random-noise-buffer';

const HEARING_CORRECTION_TONE_SECONDS = 0.4;
const HEARING_CORRECTION_RAMP_SECONDS = 0.02;
const HEARING_CORRECTION_PREVIEW_GAIN = 0.05;

function assertPreviewConfiguration(
  configuration: PlaybackSourceConfiguration,
): asserts configuration is Exclude<
  PlaybackSourceConfiguration,
  { readonly kind: 'therapy-filter' }
> {
  if (configuration.kind === 'therapy-filter') {
    throw new TypeError('Expected a Frequency Matching preview configuration');
  }
}

function createHearingCorrectionBuffer(
  context: AudioContext,
  correction: Extract<
    PlaybackSourceConfiguration,
    { readonly kind: 'hearing-correction-preview' }
  >['hearingCorrection'],
): AudioBuffer {
  const toneSamples = Math.round(
    context.sampleRate * HEARING_CORRECTION_TONE_SECONDS,
  );
  const rampSamples = Math.round(
    context.sampleRate * HEARING_CORRECTION_RAMP_SECONDS,
  );
  const buffer = context.createBuffer(
    1,
    toneSamples * TINNITUS_MATCH_FREQUENCIES_HZ.length,
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  const maxGain = getPaper2025V1HearingGain(correction, 16_000);

  TINNITUS_MATCH_FREQUENCIES_HZ.forEach((frequencyHz, toneIndex) => {
    const relativeGain =
      getPaper2025V1HearingGain(correction, frequencyHz) / maxGain;
    const offset = toneIndex * toneSamples;
    for (let sampleIndex = 0; sampleIndex < toneSamples; sampleIndex += 1) {
      const edgeDistance = Math.min(sampleIndex, toneSamples - 1 - sampleIndex);
      const envelope =
        edgeDistance < rampSamples
          ? 0.5 * (1 - Math.cos((Math.PI * edgeDistance) / rampSamples))
          : 1;
      samples[offset + sampleIndex] =
        HEARING_CORRECTION_PREVIEW_GAIN *
        relativeGain *
        envelope *
        Math.sin(
          (Math.PI * 2 * frequencyHz * sampleIndex) / context.sampleRate,
        );
    }
  });

  return buffer;
}

export const matchingStimulusSourceFactory: PlaybackSourceFactory = {
  capabilities: {
    liveFrequency: true,
    liveMasterGain: true,
    liveFilterSettings: false,
  },
  async create(request): Promise<RunningPlaybackSource> {
    assertPreviewConfiguration(request.configuration);
    request.signal.throwIfAborted();

    const { context, output } = request;
    const initialConfiguration = request.configuration;
    let frequencyNode: AudioParam | null = null;
    let source: AudioScheduledSourceNode;
    let filter: BiquadFilterNode | null = null;

    if (initialConfiguration.kind === 'hearing-correction-preview') {
      const bufferSource = context.createBufferSource();
      bufferSource.buffer = createHearingCorrectionBuffer(
        context,
        initialConfiguration.hearingCorrection,
      );
      bufferSource.loop = true;
      bufferSource.connect(output);
      source = bufferSource;
    } else if (initialConfiguration.match.type === 'tone') {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = initialConfiguration.match.frequencyHz;
      oscillator.connect(output);
      frequencyNode = oscillator.frequency;
      source = oscillator;
    } else {
      const bufferSource = context.createBufferSource();
      filter = context.createBiquadFilter();
      bufferSource.buffer = createRandomNoiseBuffer(context);
      bufferSource.loop = true;
      filter.type = 'bandpass';
      filter.frequency.value = initialConfiguration.match.frequencyHz;
      filter.Q.value = 4;
      bufferSource.connect(filter);
      filter.connect(output);
      frequencyNode = filter.frequency;
      source = bufferSource;
    }

    source.start();
    let disposed = false;

    return {
      applyLiveConfiguration(configuration) {
        assertPreviewConfiguration(configuration);
        if (
          initialConfiguration.kind === 'hearing-correction-preview' ||
          configuration.kind === 'hearing-correction-preview'
        ) {
          return { kind: 'replace' };
        }
        if (configuration.match.type !== initialConfiguration.match.type) {
          return { kind: 'replace' };
        }

        frequencyNode?.setTargetAtTime(
          configuration.match.frequencyHz,
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
        filter?.disconnect();
      },
    };
  },
};
