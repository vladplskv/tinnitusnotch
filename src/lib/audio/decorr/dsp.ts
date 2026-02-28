import {
	AMPLITUDE_MODULATION_DEPTH,
	DEFAULT_RAMP_DURATION_SECONDS,
	DEFAULT_SEGMENT_DURATION_SECONDS,
	FUNDAMENTAL_MAX_HZ,
	FUNDAMENTAL_MIN_HZ,
	HARMONIC_MAX_HZ,
	HARMONIC_MIN_HZ,
	SMR_CHANGE_RATE_HZ,
	SMR_MEAN,
	SMR_VARIABILITY,
	TEMPORAL_MODULATION_RATE_HZ,
} from './constants';
import {getHearingGain} from './hearing-profile';
import type {
	BandHz,
	HearingProfile,
} from './types';

export interface SpectralRateParams {
	mu: number;
	r: number;
	v: number;
	p: number;
}

export interface AmplitudeTermParams {
	d: number;
	omega: number;
	Fn: number;
	S: number;
	q: number;
}

export interface DecorrAMSegmentOptions {
	sampleRate: number;
	modBand: BandHz;
	hearingProfile: HearingProfile;
	sessionGain: number;
	durationSeconds?: number;
	rampSeconds?: number;
	rng?: () => number;
}

export interface DecorrAMSegmentResult {
	samples: Float32Array;
	fundamentalHz: number;
	harmonicCount: number;
}

const TWO_PI = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function randomInRange(min: number, max: number, rng: () => number): number {
	return min + (max - min) * rng();
}

export function createSeededRng(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state += 0x6D2B79F5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function computeSpectralModulationRate(t: number, params: SpectralRateParams): number {
	return params.mu + params.r * Math.sin(params.p + TWO_PI * params.v * t);
}

export function computeOctaveDistance(harmonicFrequencyHz: number, centerFrequencyHz: number): number {
	return Math.log2(harmonicFrequencyHz / centerFrequencyHz);
}

export function computeAmplitudeTerm(t: number, params: AmplitudeTermParams): number {
	return 1 + params.d * Math.sin(TWO_PI * (params.omega * t + params.Fn * params.S) + params.q);
}

export function applyRaisedCosineRamp(
	samples: Float32Array,
	sampleRate: number,
	rampSeconds: number,
): void {
	const rampSamples = Math.min(Math.round(rampSeconds * sampleRate), Math.floor(samples.length / 2));
	if (rampSamples <= 0) {
		return;
	}

	for (let i = 0; i < rampSamples; i += 1) {
		const ratio = i / rampSamples;
		const envelope = 0.5 * (1 - Math.cos(Math.PI * ratio));
		samples[i] *= envelope;
		samples[samples.length - 1 - i] *= envelope;
	}
}

export function normalizeToPeak(samples: Float32Array, targetPeak: number): void {
	let peak = 0;
	for (let i = 0; i < samples.length; i += 1) {
		const magnitude = Math.abs(samples[i]);
		if (magnitude > peak) {
			peak = magnitude;
		}
	}

	if (peak <= 0) {
		return;
	}

	const gain = targetPeak / peak;
	for (let i = 0; i < samples.length; i += 1) {
		samples[i] *= gain;
	}
}

export function generateDecorrAMSegment(options: DecorrAMSegmentOptions): DecorrAMSegmentResult {
	const rng = options.rng ?? Math.random;
	const durationSeconds = options.durationSeconds ?? DEFAULT_SEGMENT_DURATION_SECONDS;
	const rampSeconds = options.rampSeconds ?? DEFAULT_RAMP_DURATION_SECONDS;
	const sampleCount = Math.max(1, Math.round(options.sampleRate * durationSeconds));
	const samples = new Float32Array(sampleCount);

	const fundamentalHz = randomInRange(FUNDAMENTAL_MIN_HZ, FUNDAMENTAL_MAX_HZ, rng);
	const harmonicMin = Math.ceil(HARMONIC_MIN_HZ / fundamentalHz);
	const harmonicMax = Math.floor(HARMONIC_MAX_HZ / fundamentalHz);
	const bandCenterHz = Math.sqrt(options.modBand[0] * options.modBand[1]);
	const q = randomInRange(0, TWO_PI, rng);
	const p = randomInRange(0, TWO_PI, rng);
	const sessionGain = clamp(options.sessionGain, 0, 1);
	let gainSquareSum = 0;

	let harmonicCount = 0;
	for (let harmonic = harmonicMin; harmonic <= harmonicMax; harmonic += 1) {
		const harmonicFrequencyHz = harmonic * fundamentalHz;
		const angularStep = TWO_PI * harmonicFrequencyHz / options.sampleRate;
		const harmonicPhase = randomInRange(0, TWO_PI, rng);
		const inBand = harmonicFrequencyHz >= options.modBand[0] && harmonicFrequencyHz <= options.modBand[1];
		const octaveDistance = inBand ? computeOctaveDistance(harmonicFrequencyHz, bandCenterHz) : 0;
		const hearingGain = getHearingGain(options.hearingProfile, harmonicFrequencyHz);
		gainSquareSum += hearingGain * hearingGain;

		for (let i = 0; i < sampleCount; i += 1) {
			const t = i / options.sampleRate;
			const spectralRate = computeSpectralModulationRate(t, {
				mu: SMR_MEAN,
				r: SMR_VARIABILITY,
				v: SMR_CHANGE_RATE_HZ,
				p,
			});
			const amplitude = inBand
				? computeAmplitudeTerm(t, {
					d: AMPLITUDE_MODULATION_DEPTH,
					omega: TEMPORAL_MODULATION_RATE_HZ,
					Fn: octaveDistance,
					S: spectralRate,
					q,
				})
				: 1;

			samples[i] += hearingGain * amplitude * Math.sin(harmonicPhase + angularStep * i);
		}

		harmonicCount += 1;
	}

	applyRaisedCosineRamp(samples, options.sampleRate, rampSeconds);
	const outputScale = gainSquareSum > 0 ? sessionGain / Math.sqrt(gainSquareSum) : 0;
	for (let i = 0; i < samples.length; i += 1) {
		samples[i] *= outputScale;
	}

	return {
		samples,
		fundamentalHz,
		harmonicCount,
	};
}

interface EnvelopeOptions {
	sampleRate: number;
	durationSeconds: number;
	frequenciesHz: number[];
	bandCenterHz: number;
	q: number;
	p: number;
	useDynamicSpectralRate: boolean;
}

export function generateAmplitudeEnvelopes(options: EnvelopeOptions): number[][] {
	const sampleCount = Math.max(1, Math.round(options.sampleRate * options.durationSeconds));

	return options.frequenciesHz.map((frequencyHz) => {
		const Fn = computeOctaveDistance(frequencyHz, options.bandCenterHz);
		const envelope = new Array<number>(sampleCount);

		for (let i = 0; i < sampleCount; i += 1) {
			const t = i / options.sampleRate;
			const spectralRate = options.useDynamicSpectralRate
				? computeSpectralModulationRate(t, {
					mu: SMR_MEAN,
					r: SMR_VARIABILITY,
					v: SMR_CHANGE_RATE_HZ,
					p: options.p,
				})
				: SMR_MEAN;

			envelope[i] = computeAmplitudeTerm(t, {
				d: AMPLITUDE_MODULATION_DEPTH,
				omega: TEMPORAL_MODULATION_RATE_HZ,
				Fn,
				S: spectralRate,
				q: options.q,
			});
		}

		return envelope;
	});
}

export function pearsonCorrelation(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) {
		return 0;
	}

	let sumA = 0;
	let sumB = 0;
	for (let i = 0; i < a.length; i += 1) {
		sumA += a[i];
		sumB += b[i];
	}

	const meanA = sumA / a.length;
	const meanB = sumB / b.length;

	let numerator = 0;
	let varA = 0;
	let varB = 0;
	for (let i = 0; i < a.length; i += 1) {
		const deltaA = a[i] - meanA;
		const deltaB = b[i] - meanB;
		numerator += deltaA * deltaB;
		varA += deltaA * deltaA;
		varB += deltaB * deltaB;
	}

	if (varA === 0 || varB === 0) {
		return 0;
	}

	return numerator / Math.sqrt(varA * varB);
}

export function computeMeanAbsoluteOffDiagonalCorrelation(channels: number[][]): number {
	if (channels.length <= 1) {
		return 0;
	}

	let pairCount = 0;
	let sum = 0;
	for (let i = 0; i < channels.length; i += 1) {
		for (let j = i + 1; j < channels.length; j += 1) {
			sum += Math.abs(pearsonCorrelation(channels[i], channels[j]));
			pairCount += 1;
		}
	}

	if (pairCount === 0) {
		return 0;
	}

	return sum / pairCount;
}
