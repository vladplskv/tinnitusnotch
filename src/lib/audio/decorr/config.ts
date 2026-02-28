import type {
	DecorrConfig,
	DecorrMode,
	HearingProfile,
	MatchResult,
} from './types';

export interface DecorrProcessorConfig {
	mode: DecorrMode;
	activeBand: [number, number];
	shamBand: [number, number];
	hearingProfile: HearingProfile;
	sessionGain: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function buildDecorrProcessorConfig(
	config: DecorrConfig,
	matchResult: MatchResult,
	mode: DecorrMode = config.mode,
): DecorrProcessorConfig {
	return {
		mode,
		activeBand: [...matchResult.activeBand] as [number, number],
		shamBand: [...matchResult.shamBand] as [number, number],
		hearingProfile: config.hearingProfile,
		sessionGain: clamp(config.sessionGain, 0, 1),
	};
}
