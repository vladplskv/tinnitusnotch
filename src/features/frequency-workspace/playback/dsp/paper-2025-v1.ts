import type { HearingCorrectionId } from '../../model/types';

export const PAPER_2025_V1_CONTRACT = 'paper-2025-v1' as const;

export type FrequencyBandHz = readonly [lowHz: number, highHz: number];

export interface Paper2025V1Configuration {
  readonly contractVersion: typeof PAPER_2025_V1_CONTRACT;
  readonly sampleRate: number;
  readonly activeBandHz: FrequencyBandHz;
  readonly hearingCorrection: HearingCorrectionId;
  readonly seed: number;
}

export interface Paper2025V1Renderer {
  process(target: Float32Array): void;
}

const TWO_PI = Math.PI * 2;
const SEGMENT_DURATION_SECONDS = 4;
const RAMP_DURATION_SECONDS = 1;
const FUNDAMENTAL_MIN_HZ = 96;
const FUNDAMENTAL_MAX_HZ = 256;
const HARMONIC_MIN_HZ = 1_000;
const HARMONIC_MAX_HZ = 16_000;
const TARGET_RMS = 0.01;
const SMR_MEAN = 4.5;
const SMR_VARIABILITY = 3;
const SMR_CHANGE_RATE_HZ = 0.125;
const TEMPORAL_MODULATION_RATE_HZ = 1;

const MAX_BOOST_DB: Readonly<Record<HearingCorrectionId, number>> = {
  a1: 0,
  a2: 15,
  c1: 30,
  c2: 45,
};

interface Harmonic {
  readonly frequencyHz: number;
  readonly phase: number;
  readonly gain: number;
  readonly octaveDistance: number;
  readonly inBand: boolean;
}

function assertConfiguration(configuration: Paper2025V1Configuration): void {
  const [lowHz, highHz] = configuration.activeBandHz;

  if (
    configuration.contractVersion !== PAPER_2025_V1_CONTRACT ||
    !Number.isFinite(configuration.sampleRate) ||
    configuration.sampleRate <= HARMONIC_MAX_HZ * 2 ||
    !Number.isFinite(lowHz) ||
    !Number.isFinite(highHz) ||
    lowHz < HARMONIC_MIN_HZ ||
    highHz > HARMONIC_MAX_HZ ||
    lowHz >= highHz
  ) {
    throw new RangeError('Invalid paper-2025-v1 DSP configuration');
  }
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

function interpolateLog2(
  frequencyHz: number,
  lowHz: number,
  highHz: number,
): number {
  return Math.log2(frequencyHz / lowHz) / Math.log2(highHz / lowHz);
}

export function getPaper2025V1HearingGain(
  correction: HearingCorrectionId,
  frequencyHz: number,
): number {
  const maxBoostDb = MAX_BOOST_DB[correction];
  let correctionDb: number;

  if (frequencyHz <= 2_000 || maxBoostDb === 0) {
    correctionDb = 0;
  } else if (frequencyHz < 2_800) {
    correctionDb =
      interpolateLog2(frequencyHz, 2_000, 2_800) * (maxBoostDb / 9);
  } else if (frequencyHz <= 8_000) {
    correctionDb =
      (1 / 9 + interpolateLog2(frequencyHz, 2_800, 8_000) * (7 / 9)) *
      maxBoostDb;
  } else {
    correctionDb = maxBoostDb;
  }

  return 10 ** (correctionDb / 20);
}

function raisedCosineEnvelope(
  sampleIndex: number,
  segmentSampleCount: number,
  rampSampleCount: number,
): number {
  if (sampleIndex < rampSampleCount) {
    return 0.5 * (1 - Math.cos((Math.PI * sampleIndex) / rampSampleCount));
  }

  const samplesAfter = segmentSampleCount - 1 - sampleIndex;
  if (samplesAfter < rampSampleCount) {
    return 0.5 * (1 - Math.cos((Math.PI * samplesAfter) / rampSampleCount));
  }

  return 1;
}

export function createPaper2025V1Renderer(
  configuration: Paper2025V1Configuration,
): Paper2025V1Renderer {
  assertConfiguration(configuration);

  const random = createSeededRandom(configuration.seed);
  const segmentSampleCount = Math.round(
    configuration.sampleRate * SEGMENT_DURATION_SECONDS,
  );
  const rampSampleCount = Math.round(
    configuration.sampleRate * RAMP_DURATION_SECONDS,
  );
  const inverseSampleRate = 1 / configuration.sampleRate;
  const [bandLowHz, bandHighHz] = configuration.activeBandHz;
  const bandCenterHz = Math.sqrt(bandLowHz * bandHighHz);

  let segmentSampleIndex = segmentSampleCount;
  let harmonics: readonly Harmonic[] = [];
  let modulationPhase = 0;
  let ripplePhase = 0;
  let outputScale = 0;

  function startSegment(): void {
    const fundamentalHz =
      FUNDAMENTAL_MIN_HZ + (FUNDAMENTAL_MAX_HZ - FUNDAMENTAL_MIN_HZ) * random();
    const harmonicMin = Math.ceil(HARMONIC_MIN_HZ / fundamentalHz);
    const harmonicMax = Math.floor(HARMONIC_MAX_HZ / fundamentalHz);
    const nextHarmonics: Harmonic[] = [];
    let expectedEnergy = 0;

    modulationPhase = random() * TWO_PI;
    ripplePhase = random() * TWO_PI;

    for (
      let harmonicNumber = harmonicMin;
      harmonicNumber <= harmonicMax;
      harmonicNumber += 1
    ) {
      const frequencyHz = harmonicNumber * fundamentalHz;
      const inBand = frequencyHz >= bandLowHz && frequencyHz <= bandHighHz;
      const gain = getPaper2025V1HearingGain(
        configuration.hearingCorrection,
        frequencyHz,
      );

      nextHarmonics.push({
        frequencyHz,
        phase: random() * TWO_PI,
        gain,
        octaveDistance: inBand ? Math.log2(frequencyHz / bandCenterHz) : 0,
        inBand,
      });
      expectedEnergy += (inBand ? 0.75 : 0.5) * gain * gain;
    }

    harmonics = nextHarmonics;
    outputScale =
      expectedEnergy > 0 ? TARGET_RMS / Math.sqrt(expectedEnergy) : 0;
    segmentSampleIndex = 0;
  }

  return {
    process(target) {
      for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
        if (segmentSampleIndex >= segmentSampleCount) {
          startSegment();
        }

        const timeSeconds = segmentSampleIndex * inverseSampleRate;
        const spectralRate =
          SMR_MEAN +
          SMR_VARIABILITY *
            Math.sin(ripplePhase + TWO_PI * SMR_CHANGE_RATE_HZ * timeSeconds);
        const temporalTerm = TWO_PI * TEMPORAL_MODULATION_RATE_HZ * timeSeconds;
        let value = 0;

        for (
          let harmonicIndex = 0;
          harmonicIndex < harmonics.length;
          harmonicIndex += 1
        ) {
          const harmonic = harmonics[harmonicIndex];
          const amplitude = harmonic.inBand
            ? 1 +
              Math.sin(
                temporalTerm +
                  TWO_PI * harmonic.octaveDistance * spectralRate +
                  modulationPhase,
              )
            : 1;
          value +=
            harmonic.gain *
            amplitude *
            Math.sin(
              harmonic.phase + TWO_PI * harmonic.frequencyHz * timeSeconds,
            );
        }

        target[targetIndex] =
          value *
          outputScale *
          raisedCosineEnvelope(
            segmentSampleIndex,
            segmentSampleCount,
            rampSampleCount,
          );
        segmentSampleIndex += 1;
      }
    },
  };
}
