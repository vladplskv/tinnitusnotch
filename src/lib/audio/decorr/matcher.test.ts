import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	selectTinnitusMatch,
	type SelectTinnitusMatchInput,
} from './matcher';

function createAudibleMap(defaultValue: boolean): Record<number, boolean> {
	return {
		1000: defaultValue,
		1200: defaultValue,
		1400: defaultValue,
		1700: defaultValue,
		2000: defaultValue,
		2400: defaultValue,
		2800: defaultValue,
		3400: defaultValue,
		4000: defaultValue,
		4800: defaultValue,
		5700: defaultValue,
		6700: defaultValue,
		8000: defaultValue,
		9500: defaultValue,
		11000: defaultValue,
		13000: defaultValue,
		16000: defaultValue,
	};
}

describe('selectTinnitusMatch', () => {
	it('maps all 17 match frequencies to expected A1/C1 bands', () => {
		const audibleMap = createAudibleMap(true);

		const expectations: Array<{inputHz: number; activeBand: [number, number]; shamBand: [number, number]}> = [
			{inputHz: 1000, activeBand: [1000, 2000], shamBand: [2000, 4000]},
			{inputHz: 1200, activeBand: [1000, 2000], shamBand: [2000, 4000]},
			{inputHz: 1400, activeBand: [1000, 2000], shamBand: [2000, 4000]},
			{inputHz: 1700, activeBand: [1400, 2800], shamBand: [2800, 5700]},
			{inputHz: 2000, activeBand: [1400, 2800], shamBand: [2800, 5700]},
			{inputHz: 2400, activeBand: [2000, 4000], shamBand: [4000, 8000]},
			{inputHz: 2800, activeBand: [2000, 4000], shamBand: [4000, 8000]},
			{inputHz: 3400, activeBand: [2800, 5700], shamBand: [5700, 11000]},
			{inputHz: 4000, activeBand: [2800, 5700], shamBand: [5700, 11000]},
			{inputHz: 4800, activeBand: [4000, 8000], shamBand: [2000, 4000]},
			{inputHz: 5700, activeBand: [4000, 8000], shamBand: [2000, 4000]},
			{inputHz: 6700, activeBand: [5700, 11000], shamBand: [2800, 5700]},
			{inputHz: 8000, activeBand: [5700, 11000], shamBand: [2800, 5700]},
			{inputHz: 9500, activeBand: [5700, 11000], shamBand: [2800, 5700]},
			{inputHz: 11000, activeBand: [8000, 16000], shamBand: [4000, 8000]},
			{inputHz: 13000, activeBand: [8000, 16000], shamBand: [4000, 8000]},
			{inputHz: 16000, activeBand: [8000, 16000], shamBand: [4000, 8000]},
		];

		for (const testCase of expectations) {
			const result = selectTinnitusMatch({
				selectedHz: testCase.inputHz,
				audibleMap,
			});

			expect(result.matchedHz).toBe(testCase.inputHz);
			expect(result.activeBand).toEqual(testCase.activeBand);
			expect(result.shamBand).toEqual(testCase.shamBand);
		}
	});

	it('uses A2 fallback when A1 band is fully inaudible', () => {
		const audibleMap = createAudibleMap(false);
		audibleMap[1000] = true;
		audibleMap[1200] = true;
		audibleMap[5700] = true;

		const input: SelectTinnitusMatchInput = {
			selectedHz: 1700,
			audibleMap,
		};
		const result = selectTinnitusMatch(input);

		expect(result.activeBand).toEqual([1000, 2000]);
		expect(result.shamBand).toEqual([2800, 5700]);
	});

	it('uses C2 fallback when C1 band is fully inaudible', () => {
		const audibleMap = createAudibleMap(false);
		audibleMap[1400] = true;
		audibleMap[1700] = true;
		audibleMap[4800] = true;
		audibleMap[5700] = true;
		audibleMap[6700] = true;

		const result = selectTinnitusMatch({
			selectedHz: 4800,
			audibleMap,
		});

		expect(result.activeBand).toEqual([4000, 8000]);
		expect(result.shamBand).toEqual([1400, 2800]);
	});

	it('snaps to nearest supported tinnitus frequency', () => {
		const result = selectTinnitusMatch({
			selectedHz: 3600,
			audibleMap: createAudibleMap(true),
		});

		expect(result.matchedHz).toBe(3400);
		expect(result.activeBand).toEqual([2800, 5700]);
		expect(result.shamBand).toEqual([5700, 11000]);
	});
});
