import {
	BAND_PREFERENCE_BY_MATCH_HZ,
	MODULATION_BANDS_HZ,
	TINNITUS_MATCH_FREQUENCIES_HZ,
} from './constants';
import type {
	BandHz,
	MatchResult,
} from './types';

export interface SelectTinnitusMatchInput {
	selectedHz: number;
	audibleMap: Record<number, boolean>;
}

function toNumberKeyMap(map: Record<number, boolean>): Map<number, boolean> {
	return new Map(
		Object.entries(map).map(([key, value]) => [Number.parseFloat(key), Boolean(value)]),
	);
}

function getNearestMatchFrequencyHz(selectedHz: number): number {
	let nearestHz = TINNITUS_MATCH_FREQUENCIES_HZ[0];
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const candidateHz of TINNITUS_MATCH_FREQUENCIES_HZ) {
		const distance = Math.abs(candidateHz - selectedHz);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestHz = candidateHz;
		}
	}

	return nearestHz;
}

function bandContainsAudibleFrequency(
	band: BandHz,
	audibleMap: Map<number, boolean>,
): boolean {
	const [lowHz, highHz] = band;
	const frequenciesInBand = TINNITUS_MATCH_FREQUENCIES_HZ.filter((hz) => hz >= lowHz && hz <= highHz);

	if (frequenciesInBand.length === 0) {
		return true;
	}

	return frequenciesInBand.some((hz) => audibleMap.get(hz) ?? true);
}

function pickBand(
	primaryBandIndex: number,
	fallbackBandIndex: number | undefined,
	audibleMap: Map<number, boolean>,
): BandHz {
	const primaryBand = [...MODULATION_BANDS_HZ[primaryBandIndex]] as BandHz;
	if (bandContainsAudibleFrequency(primaryBand, audibleMap)) {
		return primaryBand;
	}

	if (fallbackBandIndex === undefined) {
		return primaryBand;
	}

	const fallbackBand = [...MODULATION_BANDS_HZ[fallbackBandIndex]] as BandHz;
	if (bandContainsAudibleFrequency(fallbackBand, audibleMap)) {
		return fallbackBand;
	}

	return primaryBand;
}

export function selectTinnitusMatch(input: SelectTinnitusMatchInput): MatchResult {
	const matchedHz = getNearestMatchFrequencyHz(input.selectedHz);
	const row = BAND_PREFERENCE_BY_MATCH_HZ[matchedHz];
	const audibleMap = toNumberKeyMap(input.audibleMap);

	const activeBand = pickBand(row.activePrimary, row.activeFallback, audibleMap);
	const shamBand = pickBand(row.shamPrimary, row.shamFallback, audibleMap);

	return {
		matchedHz,
		activeBand,
		shamBand,
	};
}
