import {
  CR_MAX_TINNITUS_FREQUENCY_HZ,
  CR_MIN_TINNITUS_FREQUENCY_HZ,
  getCRToneFrequenciesHz,
  type CRToneFrequenciesHz,
} from '../../model/cr-neuromodulation';

/** Four tones per cycle at 1.5 cycles per second (Tass et al. 2012). */
export const CR_TONE_SECONDS = 1 / 6;
export const CR_TONES_PER_CYCLE = 4;
/** Three cycles of tones, then two silent cycles. */
export const CR_ON_CYCLES = 3;
export const CR_OFF_CYCLES = 2;
export const CR_RAMP_SECONDS = 0.02;
/**
 * Full scale, the level of the Matching Stimulus tone, so a volume that
 * matched the tinnitus loudness also sets the tones to it.
 */
export const CR_TONE_AMPLITUDE = 1;

const TWO_PI = Math.PI * 2;
const SLOTS_PER_PERIOD = CR_TONES_PER_CYCLE * (CR_ON_CYCLES + CR_OFF_CYCLES);
const ON_SLOTS = CR_TONES_PER_CYCLE * CR_ON_CYCLES;

export interface CRNeuromodulationConfiguration {
  readonly sampleRate: number;
  readonly tinnitusFrequencyHz: number;
  readonly seed: number;
}

export interface CRNeuromodulationRenderer {
  process(target: Float32Array): void;
  /** Takes effect from the next tone, so a tone never jumps mid-way. */
  setTinnitusFrequency(frequencyHz: number): void;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/*
 * Start is blocked outside the range; a live edit past an edge keeps the
 * edge tones instead of stopping therapy mid-session.
 */
function clampTinnitusFrequency(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz)) {
    throw new RangeError('Invalid CR Neuromodulation tinnitus frequency');
  }
  return Math.min(
    CR_MAX_TINNITUS_FREQUENCY_HZ,
    Math.max(CR_MIN_TINNITUS_FREQUENCY_HZ, frequencyHz),
  );
}

export function createCRNeuromodulationRenderer(
  configuration: CRNeuromodulationConfiguration,
): CRNeuromodulationRenderer {
  const { sampleRate } = configuration;
  const highestToneHz = getCRToneFrequenciesHz(CR_MAX_TINNITUS_FREQUENCY_HZ)[3];
  if (!Number.isFinite(sampleRate) || sampleRate <= highestToneHz * 2) {
    throw new RangeError('Invalid CR Neuromodulation sample rate');
  }

  const random = createSeededRandom(configuration.seed);
  const slotSamples = Math.round(sampleRate * CR_TONE_SECONDS);
  const rampSamples = Math.round(sampleRate * CR_RAMP_SECONDS);
  const order = [0, 1, 2, 3];
  let tonesHz: CRToneFrequenciesHz = getCRToneFrequenciesHz(
    clampTinnitusFrequency(configuration.tinnitusFrequencyHz),
  );
  let slot = -1;
  let sampleInSlot = slotSamples;
  let phaseStep = 0;
  let phase = 0;

  function shuffleOrder() {
    for (let index = order.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [order[index], order[other]] = [order[other]!, order[index]!];
    }
  }

  function startSlot() {
    slot = (slot + 1) % SLOTS_PER_PERIOD;
    sampleInSlot = 0;
    phase = 0;
    if (slot >= ON_SLOTS) {
      phaseStep = 0;
      return;
    }
    const position = slot % CR_TONES_PER_CYCLE;
    if (position === 0) shuffleOrder();
    phaseStep = (TWO_PI * tonesHz[order[position]!]!) / sampleRate;
  }

  function envelope(sample: number): number {
    if (sample < rampSamples) {
      return 0.5 - 0.5 * Math.cos((Math.PI * sample) / rampSamples);
    }
    const remaining = slotSamples - sample;
    if (remaining < rampSamples) {
      return 0.5 - 0.5 * Math.cos((Math.PI * remaining) / rampSamples);
    }
    return 1;
  }

  return {
    process(target) {
      for (let index = 0; index < target.length; index += 1) {
        if (sampleInSlot >= slotSamples) startSlot();
        if (phaseStep === 0) {
          target[index] = 0;
        } else {
          target[index] =
            CR_TONE_AMPLITUDE * envelope(sampleInSlot) * Math.sin(phase);
          phase += phaseStep;
          if (phase >= TWO_PI) phase -= TWO_PI;
        }
        sampleInSlot += 1;
      }
    },
    setTinnitusFrequency(frequencyHz) {
      tonesHz = getCRToneFrequenciesHz(clampTinnitusFrequency(frequencyHz));
    },
  };
}
