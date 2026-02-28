import type {BandHz} from './types';

export const TINNITUS_MATCH_FREQUENCIES_HZ = [
	1000,
	1200,
	1400,
	1700,
	2000,
	2400,
	2800,
	3400,
	4000,
	4800,
	5700,
	6700,
	8000,
	9500,
	11000,
	13000,
	16000,
] as const;

export const MODULATION_BANDS_HZ = [
	[1000, 2000],
	[1400, 2800],
	[2000, 4000],
	[2800, 5700],
	[4000, 8000],
	[5700, 11000],
	[8000, 16000],
] as const satisfies ReadonlyArray<BandHz>;

interface BandPreferenceRow {
	activePrimary: number;
	shamPrimary: number;
	activeFallback?: number;
	shamFallback?: number;
}

export const BAND_PREFERENCE_BY_MATCH_HZ: Record<number, BandPreferenceRow> = {
	1000: {activePrimary: 0, shamPrimary: 2},
	1200: {activePrimary: 0, shamPrimary: 2},
	1400: {activePrimary: 0, shamPrimary: 2},
	1700: {activePrimary: 1, shamPrimary: 3, activeFallback: 0},
	2000: {activePrimary: 1, shamPrimary: 3},
	2400: {activePrimary: 2, shamPrimary: 4, activeFallback: 1},
	2800: {activePrimary: 2, shamPrimary: 4},
	3400: {activePrimary: 3, shamPrimary: 5, activeFallback: 2},
	4000: {activePrimary: 3, shamPrimary: 5},
	4800: {activePrimary: 4, shamPrimary: 2, activeFallback: 3, shamFallback: 1},
	5700: {activePrimary: 4, shamPrimary: 2},
	6700: {activePrimary: 5, shamPrimary: 3, activeFallback: 4, shamFallback: 2},
	8000: {activePrimary: 5, shamPrimary: 3},
	9500: {activePrimary: 5, shamPrimary: 3},
	11000: {activePrimary: 6, shamPrimary: 4},
	13000: {activePrimary: 6, shamPrimary: 4},
	16000: {activePrimary: 6, shamPrimary: 4},
};

export const DEFAULT_DECORR_SAMPLE_RATE = 44100;
export const DEFAULT_SEGMENT_DURATION_SECONDS = 4;
export const DEFAULT_RAMP_DURATION_SECONDS = 1;

export const AMPLITUDE_MODULATION_DEPTH = 1;
export const TEMPORAL_MODULATION_RATE_HZ = 1;

export const SMR_MEAN = 4.5;
export const SMR_VARIABILITY = 3;
export const SMR_CHANGE_RATE_HZ = 0.125;

export const FUNDAMENTAL_MIN_HZ = 96;
export const FUNDAMENTAL_MAX_HZ = 256;

export const HARMONIC_MIN_HZ = 1000;
export const HARMONIC_MAX_HZ = 16000;
