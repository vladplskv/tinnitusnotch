import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	getHearingCorrectionDb,
	getHearingGain,
	getHearingProfileMaxBoostDb,
} from './hearing-profile';
import type {HearingProfile} from './types';

describe('hearing profile correction curves', () => {
	const profiles: HearingProfile[] = ['normal', 'mild', 'moderate', 'severe'];

	it('follows control points from Fig.1 shape', () => {
		for (const profile of profiles) {
			const maxDb = getHearingProfileMaxBoostDb(profile);
			expect(getHearingCorrectionDb(profile, 1000)).toBeCloseTo(0, 6);
			expect(getHearingCorrectionDb(profile, 2000)).toBeCloseTo(0, 6);
			expect(getHearingCorrectionDb(profile, 2800)).toBeCloseTo(maxDb / 9, 6);
			expect(getHearingCorrectionDb(profile, 8000)).toBeCloseTo((8 * maxDb) / 9, 6);
			expect(getHearingCorrectionDb(profile, 12000)).toBeCloseTo(maxDb, 6);
		}
	});

	it('returns unit gain for normal profile', () => {
		expect(getHearingGain('normal', 1000)).toBeCloseTo(1, 8);
		expect(getHearingGain('normal', 4000)).toBeCloseTo(1, 8);
		expect(getHearingGain('normal', 12000)).toBeCloseTo(1, 8);
	});

	it('increases gain in high frequencies for non-normal profiles', () => {
		expect(getHearingGain('mild', 12000)).toBeGreaterThan(getHearingGain('mild', 1500));
		expect(getHearingGain('moderate', 12000)).toBeGreaterThan(getHearingGain('moderate', 1500));
		expect(getHearingGain('severe', 12000)).toBeGreaterThan(getHearingGain('severe', 1500));
	});
});
