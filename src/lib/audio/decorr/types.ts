export type BandHz = [number, number];

export type DecorrMode = 'active' | 'sham';

export type TinnitusType = 'tone' | 'noise';

export type HearingProfile = 'normal' | 'mild' | 'moderate' | 'severe';

export interface DecorrConfig {
	mode: DecorrMode;
	tinnitusHz: number;
	tinnitusType: TinnitusType;
	hearingProfile: HearingProfile;
	sessionGain: number;
}

export interface MatchResult {
	matchedHz: number;
	activeBand: BandHz;
	shamBand: BandHz;
}
