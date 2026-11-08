import {
  MAX_PLOTTED_FREQUENCY_HZ,
  MIN_PLOTTED_FREQUENCY_HZ,
  frequencyPosition,
} from './frequency-scale';

export interface SpectrumAggregationOptions {
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly width: number;
  readonly minDecibels: number;
}

export function aggregateSpectrumByPixel(
  bins: Float32Array,
  options: SpectrumAggregationOptions,
): Float32Array {
  const width = Math.max(0, Math.floor(options.width));
  const pixels = new Float32Array(width).fill(options.minDecibels);

  if (width === 0 || options.fftSize <= 0 || options.sampleRate <= 0) {
    return pixels;
  }

  const binWidthHz = options.sampleRate / options.fftSize;
  for (let index = 0; index < bins.length; index += 1) {
    const frequencyHz = index * binWidthHz;
    if (
      frequencyHz < MIN_PLOTTED_FREQUENCY_HZ ||
      frequencyHz > MAX_PLOTTED_FREQUENCY_HZ
    ) {
      continue;
    }

    const pixel = Math.min(
      width - 1,
      Math.floor(frequencyPosition(frequencyHz, width)),
    );
    pixels[pixel] = Math.max(pixels[pixel], bins[index]);
  }

  return pixels;
}
