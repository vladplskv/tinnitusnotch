export const MIN_PLOTTED_FREQUENCY_HZ = 20;
export const MAX_PLOTTED_FREQUENCY_HZ = 22_000;

const LOG_RANGE = Math.log(MAX_PLOTTED_FREQUENCY_HZ / MIN_PLOTTED_FREQUENCY_HZ);

export interface FrequencyMarkerGeometry {
  readonly exactFrequencyHz: number;
  readonly x: number;
  readonly outsideScale: boolean;
  readonly label: string;
}

export function frequencyPosition(frequencyHz: number, width: number): number {
  const safeWidth = Math.max(0, width);
  const plottedFrequency = Math.min(
    MAX_PLOTTED_FREQUENCY_HZ,
    Math.max(MIN_PLOTTED_FREQUENCY_HZ, frequencyHz),
  );

  return (
    (Math.log(plottedFrequency / MIN_PLOTTED_FREQUENCY_HZ) / LOG_RANGE) *
    safeWidth
  );
}

export function frequencyAtPosition(x: number, width: number): number {
  if (width <= 0) {
    return MIN_PLOTTED_FREQUENCY_HZ;
  }

  const ratio = Math.min(1, Math.max(0, x / width));
  if (ratio === 1) {
    return MAX_PLOTTED_FREQUENCY_HZ;
  }
  return MIN_PLOTTED_FREQUENCY_HZ * Math.exp(ratio * LOG_RANGE);
}

export function frequencyMarker(
  exactFrequencyHz: number,
  width: number,
): FrequencyMarkerGeometry {
  const outsideScale = exactFrequencyHz < MIN_PLOTTED_FREQUENCY_HZ;

  return {
    exactFrequencyHz,
    x: frequencyPosition(exactFrequencyHz, width),
    outsideScale,
    label: outsideScale
      ? `${exactFrequencyHz} Hz · < 20 Hz`
      : formatFrequency(exactFrequencyHz),
  };
}

export function formatFrequency(frequencyHz: number): string {
  if (frequencyHz < 1_000) {
    return `${Math.round(frequencyHz)} Hz`;
  }

  const kilohertz = frequencyHz / 1_000;
  return `${Number.isInteger(kilohertz) ? kilohertz : kilohertz.toFixed(1)} kHz`;
}
