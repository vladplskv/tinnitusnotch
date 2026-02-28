import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	computeAmplitudeTerm,
	computeMeanAbsoluteOffDiagonalCorrelation,
	computeOctaveDistance,
	computeSpectralModulationRate,
	createSeededRng,
	generateAmplitudeEnvelopes,
	generateDecorrAMSegment,
} from './dsp';

describe('de-correlating AM DSP equations', () => {
	it('matches Eq.(4) octave distance', () => {
		expect(computeOctaveDistance(8000, 8000)).toBeCloseTo(0, 8);
		expect(computeOctaveDistance(16000, 8000)).toBeCloseTo(1, 8);
		expect(computeOctaveDistance(4000, 8000)).toBeCloseTo(-1, 8);
	});

	it('matches Eq.(5) spectral modulation rate', () => {
		const p = Math.PI / 3;
		const t = 1.2;
		const smr = computeSpectralModulationRate(t, {
			mu: 4.5,
			r: 3,
			v: 0.125,
			p,
		});
		const expected = 4.5 + 3 * Math.sin(p + 2 * Math.PI * 0.125 * t);
		expect(smr).toBeCloseTo(expected, 10);
	});

	it('matches Eq.(2) amplitude term', () => {
		const t = 0.35;
		const value = computeAmplitudeTerm(t, {
			d: 1,
			omega: 1,
			Fn: -0.2,
			S: 5.1,
			q: 0.4,
		});
		const expected = 1 + Math.sin(2 * Math.PI * (1 * t + (-0.2) * 5.1) + 0.4);
		expect(value).toBeCloseTo(expected, 10);
	});
});

describe('de-correlating AM segment generation', () => {
	it('generates finite segment with valid length and bounded level', () => {
		const segment = generateDecorrAMSegment({
			sampleRate: 44100,
			modBand: [8000, 16000],
			hearingProfile: 'normal',
			sessionGain: 0.3,
			rng: createSeededRng(42),
		});

		expect(segment.samples.length).toBe(44100 * 4);
		expect(segment.harmonicCount).toBeGreaterThan(0);
		expect(segment.fundamentalHz).toBeGreaterThanOrEqual(96);
		expect(segment.fundamentalHz).toBeLessThanOrEqual(256);

		let maxAbs = 0;
		for (const sample of segment.samples) {
			expect(Number.isFinite(sample)).toBe(true);
			maxAbs = Math.max(maxAbs, Math.abs(sample));
		}
		expect(maxAbs).toBeGreaterThan(0);
		expect(maxAbs).toBeLessThan(2);
	});

	it('reduces off-diagonal envelope correlation versus static-SMR baseline', () => {
		const frequenciesHz = [8400, 9300, 11000, 14500];
		const bandCenterHz = Math.sqrt(8000 * 16000);
		const sampleRate = 2000;
		const durationSeconds = 8;
		const q = 0.91;
		const p = 1.17;

		const dynamic = generateAmplitudeEnvelopes({
			sampleRate,
			durationSeconds,
			frequenciesHz,
			bandCenterHz,
			q,
			p,
			useDynamicSpectralRate: true,
		});
		const baseline = generateAmplitudeEnvelopes({
			sampleRate,
			durationSeconds,
			frequenciesHz,
			bandCenterHz,
			q,
			p,
			useDynamicSpectralRate: false,
		});

		const dynamicCorr = computeMeanAbsoluteOffDiagonalCorrelation(dynamic);
		const baselineCorr = computeMeanAbsoluteOffDiagonalCorrelation(baseline);

		expect(dynamicCorr).toBeLessThan(baselineCorr);
		expect(dynamicCorr).toBeLessThan(0.75);
	});
});
