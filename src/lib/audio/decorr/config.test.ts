import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	buildDecorrProcessorConfig,
} from './config';
import type {
	DecorrConfig,
	MatchResult,
} from './types';

describe('buildDecorrProcessorConfig', () => {
	const config: DecorrConfig = {
		mode: 'active',
		tinnitusHz: 8000,
		tinnitusType: 'tone',
		hearingProfile: 'moderate',
		sessionGain: 2,
	};
	const matchResult: MatchResult = {
		matchedHz: 8000,
		activeBand: [5700, 11000],
		shamBand: [2800, 5700],
	};

	it('returns active config with clamped gain', () => {
		const result = buildDecorrProcessorConfig(config, matchResult, 'active');
		expect(result.mode).toBe('active');
		expect(result.activeBand).toEqual([5700, 11000]);
		expect(result.shamBand).toEqual([2800, 5700]);
		expect(result.hearingProfile).toBe('moderate');
		expect(result.sessionGain).toBe(1);
	});

	it('switches mode to sham while keeping same resolved bands', () => {
		const result = buildDecorrProcessorConfig(config, matchResult, 'sham');
		expect(result.mode).toBe('sham');
		expect(result.activeBand).toEqual([5700, 11000]);
		expect(result.shamBand).toEqual([2800, 5700]);
	});
});
