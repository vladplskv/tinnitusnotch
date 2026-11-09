import type { TherapyPlaybackSnapshot, TherapySession } from '../index';
import { clampCRTinnitusFrequency } from '../model/cr-neuromodulation';
import { getActiveBandStatus } from '../playback/dsp/active-band';
import {
  MAX_PLOTTED_FREQUENCY_HZ,
  MIN_PLOTTED_FREQUENCY_HZ,
} from './frequency-scale';

export type OverlayLine = 'solid' | 'dashed';
export type OverlayPattern = 'plain' | 'hatched';

export interface FrequencyOverlayMarker {
  readonly frequencyHz: number;
  readonly label: string;
}

export interface FrequencyOverlayBand {
  readonly fromHz: number;
  readonly toHz: number;
  readonly label: string;
  readonly line: OverlayLine;
  readonly pattern: OverlayPattern;
}

export interface FrequencyResponsePoint {
  readonly frequencyHz: number;
  readonly decibels: number;
}

export interface FrequencyResponseCurve {
  readonly label: string;
  readonly line: OverlayLine;
  readonly points: readonly FrequencyResponsePoint[];
}

export interface VisualizationDescription {
  readonly markers: readonly FrequencyOverlayMarker[];
  readonly bands: readonly FrequencyOverlayBand[];
  readonly responseCurves: readonly FrequencyResponseCurve[];
}

const MIN_RESPONSE_DECIBELS = -100;

export function whiteNoiseNotchDecibels(
  frequencyHz: number,
  centerFrequencyHz: number,
  q: number,
): number {
  if (frequencyHz <= 0 || centerFrequencyHz <= 0 || q <= 0) {
    return 0;
  }

  const ratio = frequencyHz / centerFrequencyHz;
  const numerator = Math.abs(ratio * ratio - 1);
  if (numerator === 0) {
    return MIN_RESPONSE_DECIBELS;
  }

  const denominator = Math.hypot(numerator, ratio / q);
  return Math.max(
    MIN_RESPONSE_DECIBELS,
    20 * Math.log10(numerator / denominator),
  );
}

export function buildVisualizationDescription(
  session: TherapySession,
  playback: TherapyPlaybackSnapshot,
  displayedFrequencyHz = session.tinnitusMatch.frequencyHz,
): VisualizationDescription {
  const line =
    playback.source.kind === 'matching-stimulus' ? 'dashed' : 'solid';
  const markers: readonly FrequencyOverlayMarker[] = [
    {
      frequencyHz: displayedFrequencyHz,
      label: 'Tinnitus Frequency',
    },
  ];

  if (session.selectedFilterId === 'white-noise') {
    return describeNotch(
      markers,
      displayedFrequencyHz,
      session.filterSettings['white-noise'].q,
      line,
    );
  }

  if (session.selectedFilterId === 'cr-neuromodulation') {
    const cr = session.filterSettings['cr-neuromodulation'];
    return cr.notchedNoise
      ? describeNotch(
          markers,
          clampCRTinnitusFrequency(displayedFrequencyHz),
          cr.notchQ,
          line,
        )
      : { markers, bands: [], responseCurves: [] };
  }

  const activeBand = getActiveBandStatus(session);
  if (!activeBand.confirmed || activeBand.bandHz === null) {
    return { markers, bands: [], responseCurves: [] };
  }

  return {
    markers,
    bands: [
      {
        fromHz: activeBand.bandHz[0],
        toHz: activeBand.bandHz[1],
        label: 'Confirmed Active Band',
        line,
        pattern: 'plain',
      },
    ],
    responseCurves: [],
  };
}

function describeNotch(
  markers: readonly FrequencyOverlayMarker[],
  centerFrequencyHz: number,
  q: number,
  line: OverlayLine,
): VisualizationDescription {
  const boundaryTerm = Math.sqrt(1 / (q * q) + 4);
  const lowerRatio = (boundaryTerm - 1 / q) / 2;
  const upperRatio = (boundaryTerm + 1 / q) / 2;

  return {
    markers,
    bands: [
      {
        fromHz: centerFrequencyHz * lowerRatio,
        toHz: centerFrequencyHz * upperRatio,
        label: 'Calculated notch ≥ 3 dB',
        line,
        pattern: 'hatched',
      },
    ],
    responseCurves: [
      {
        label: 'Calculated White Noise response',
        line,
        points: buildWhiteNoiseResponse(centerFrequencyHz, q),
      },
    ],
  };
}

function buildWhiteNoiseResponse(
  centerFrequencyHz: number,
  q: number,
): readonly FrequencyResponsePoint[] {
  const points: FrequencyResponsePoint[] = [];
  const sampleCount = 64;
  const logRange = Math.log(
    MAX_PLOTTED_FREQUENCY_HZ / MIN_PLOTTED_FREQUENCY_HZ,
  );

  for (let index = 0; index <= sampleCount; index += 1) {
    const frequencyHz =
      MIN_PLOTTED_FREQUENCY_HZ * Math.exp((index / sampleCount) * logRange);
    points.push({
      frequencyHz,
      decibels: whiteNoiseNotchDecibels(frequencyHz, centerFrequencyHz, q),
    });
  }

  points.push({ frequencyHz: centerFrequencyHz, decibels: -100 });
  points.sort((left, right) => left.frequencyHz - right.frequencyHz);
  return points;
}
