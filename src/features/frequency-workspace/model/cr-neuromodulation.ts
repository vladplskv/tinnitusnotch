/**
 * Acoustic CR Neuromodulation: four tones around the Tinnitus Frequency
 * played in random order, 1.5 cycles per second, three cycles on and two
 * off (Tass et al. 2012). The tone spacing follows the checkhearing.org
 * generator, which takes it from Hauptmann et al. 2015. Notched white noise
 * can be mixed in, as in checkhearing.org's notched neuromodulation.
 */
export const CR_MIN_TINNITUS_FREQUENCY_HZ = 500;
export const CR_MAX_TINNITUS_FREQUENCY_HZ = 10_000;

/** About -30 dB to 0 dB against the tones. */
export const MIN_CR_NOISE_LEVEL = 0.03;
export const MAX_CR_NOISE_LEVEL = 1;

export type CRToneFrequenciesHz = readonly [number, number, number, number];

export function isCRTinnitusFrequency(frequencyHz: number): boolean {
  return (
    Number.isFinite(frequencyHz) &&
    frequencyHz >= CR_MIN_TINNITUS_FREQUENCY_HZ &&
    frequencyHz <= CR_MAX_TINNITUS_FREQUENCY_HZ
  );
}

export function getCRToneFrequenciesHz(
  tinnitusFrequencyHz: number,
): CRToneFrequenciesHz {
  const f = tinnitusFrequencyHz;
  return [
    Math.floor(0.773 * f - 44.5),
    Math.floor(0.903 * f - 21.5),
    Math.floor(1.09 * f + 52),
    Math.floor(1.395 * f + 26.5),
  ];
}
