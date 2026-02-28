import type {HearingProfile} from './types';

const PROFILE_MAX_BOOST_DB: Record<HearingProfile, number> = {
	normal: 0,
	mild: 15,
	moderate: 30,
	severe: 45,
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function getHearingProfileMaxBoostDb(profile: HearingProfile): number {
	return PROFILE_MAX_BOOST_DB[profile];
}

export function getHearingCorrectionDb(profile: HearingProfile, frequencyHz: number): number {
	const maxBoostDb = getHearingProfileMaxBoostDb(profile);

	if (maxBoostDb === 0) {
		return 0;
	}

	if (frequencyHz <= 2000) {
		return 0;
	}

	if (frequencyHz < 2800) {
		const ratio = (frequencyHz - 2000) / (2800 - 2000);
		return clamp(ratio, 0, 1) * (maxBoostDb / 9);
	}

	if (frequencyHz <= 8000) {
		const ratio = (frequencyHz - 2800) / (8000 - 2800);
		const normalized = (1 / 9) + clamp(ratio, 0, 1) * (7 / 9);
		return normalized * maxBoostDb;
	}

	return maxBoostDb;
}

export function getHearingGain(profile: HearingProfile, frequencyHz: number): number {
	const correctionDb = getHearingCorrectionDb(profile, frequencyHz);
	return 10 ** (correctionDb / 20);
}
