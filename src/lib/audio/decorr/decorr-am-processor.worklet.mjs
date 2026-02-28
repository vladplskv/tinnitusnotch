const TWO_PI = Math.PI * 2;

const FUNDAMENTAL_MIN_HZ = 96;
const FUNDAMENTAL_MAX_HZ = 256;
const HARMONIC_MIN_HZ = 1000;
const HARMONIC_MAX_HZ = 16000;

const AMPLITUDE_MODULATION_DEPTH = 1;
const TEMPORAL_MODULATION_RATE_HZ = 1;
const SMR_MEAN = 4.5;
const SMR_VARIABILITY = 3;
const SMR_CHANGE_RATE_HZ = 0.125;

const SEGMENT_DURATION_SECONDS = 4;
const RAMP_DURATION_SECONDS = 1;

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function randomInRange(min, max) {
	return min + Math.random() * (max - min);
}

function getCorrectionDb(profile, frequencyHz) {
	const maxByProfile = {
		normal: 0,
		mild: 15,
		moderate: 30,
		severe: 45,
	};
	const maxBoostDb = maxByProfile[profile] ?? 0;

	if (maxBoostDb === 0 || frequencyHz <= 2000) {
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

function getHearingGain(profile, frequencyHz) {
	return 10 ** (getCorrectionDb(profile, frequencyHz) / 20);
}

function buildSegmentEnvelope(sampleRate, segmentSampleCount, rampSeconds) {
	const envelope = new Float32Array(segmentSampleCount);
	envelope.fill(1);

	const rampSamples = Math.min(
		Math.round(rampSeconds * sampleRate),
		Math.floor(segmentSampleCount / 2),
	);

	if (rampSamples <= 0) {
		return envelope;
	}

	for (let i = 0; i < rampSamples; i += 1) {
		const ratio = i / rampSamples;
		const value = 0.5 * (1 - Math.cos(Math.PI * ratio));
		envelope[i] = value;
		envelope[segmentSampleCount - 1 - i] = value;
	}

	return envelope;
}

class DecorrAMProcessor extends AudioWorkletProcessor {
	constructor() {
		super();

		this.config = {
			mode: 'active',
			activeBand: [4000, 8000],
			shamBand: [2000, 4000],
			hearingProfile: 'normal',
			sessionGain: 0.2,
		};

		this.segmentSampleCount = Math.max(1, Math.round(sampleRate * SEGMENT_DURATION_SECONDS));
		this.invSampleRate = 1 / sampleRate;
		this.segmentEnvelope = buildSegmentEnvelope(sampleRate, this.segmentSampleCount, RAMP_DURATION_SECONDS);

		this.segmentSampleIndex = this.segmentSampleCount;
		this.q = 0;
		this.p = 0;
		this.bandCenterHz = 1;
		this.outputScale = 0;

		this.harmonicCount = 0;
		this.harmonicInBand = new Uint8Array(0);
		this.harmonicFn = new Float64Array(0);
		this.harmonicGain = new Float64Array(0);
		this.carrierSin = new Float64Array(0);
		this.carrierCos = new Float64Array(0);
		this.stepSin = new Float64Array(0);
		this.stepCos = new Float64Array(0);

		this.port.onmessage = (event) => {
			const data = event.data;
			if (!data || data.type !== 'config') {
				return;
			}

			const payload = data.payload ?? {};
			const nextMode = payload.mode === 'sham' ? 'sham' : 'active';
			const nextActiveBand = Array.isArray(payload.activeBand) ? payload.activeBand : this.config.activeBand;
			const nextShamBand = Array.isArray(payload.shamBand) ? payload.shamBand : this.config.shamBand;
			const nextProfile = payload.hearingProfile ?? this.config.hearingProfile;
			const nextSessionGain = clamp(Number(payload.sessionGain ?? this.config.sessionGain), 0, 1);

			this.config = {
				mode: nextMode,
				activeBand: [Number(nextActiveBand[0]), Number(nextActiveBand[1])],
				shamBand: [Number(nextShamBand[0]), Number(nextShamBand[1])],
				hearingProfile: nextProfile,
				sessionGain: nextSessionGain,
			};

			// Apply config immediately on next sample.
			this.segmentSampleIndex = this.segmentSampleCount;
		};
	}

	_startNewSegment() {
		const fundamentalHz = randomInRange(FUNDAMENTAL_MIN_HZ, FUNDAMENTAL_MAX_HZ);
		const harmonicMin = Math.ceil(HARMONIC_MIN_HZ / fundamentalHz);
		const harmonicMax = Math.floor(HARMONIC_MAX_HZ / fundamentalHz);

		if (harmonicMax < harmonicMin) {
			this.harmonicCount = 0;
			this.outputScale = 0;
			this.segmentSampleIndex = 0;
			return;
		}

		const modBand = this.config.mode === 'active' ? this.config.activeBand : this.config.shamBand;
		this.bandCenterHz = Math.sqrt(modBand[0] * modBand[1]);
		this.q = randomInRange(0, TWO_PI);
		this.p = randomInRange(0, TWO_PI);

		this.harmonicCount = harmonicMax - harmonicMin + 1;
		this.harmonicInBand = new Uint8Array(this.harmonicCount);
		this.harmonicFn = new Float64Array(this.harmonicCount);
		this.harmonicGain = new Float64Array(this.harmonicCount);
		this.carrierSin = new Float64Array(this.harmonicCount);
		this.carrierCos = new Float64Array(this.harmonicCount);
		this.stepSin = new Float64Array(this.harmonicCount);
		this.stepCos = new Float64Array(this.harmonicCount);

		let gainSquareSum = 0;
		for (let i = 0; i < this.harmonicCount; i += 1) {
			const harmonicNumber = harmonicMin + i;
			const harmonicFrequencyHz = harmonicNumber * fundamentalHz;
			const inBand = harmonicFrequencyHz >= modBand[0] && harmonicFrequencyHz <= modBand[1];

			this.harmonicInBand[i] = inBand ? 1 : 0;
			this.harmonicFn[i] = inBand ? Math.log2(harmonicFrequencyHz / this.bandCenterHz) : 0;

			const hearingGain = getHearingGain(this.config.hearingProfile, harmonicFrequencyHz);
			this.harmonicGain[i] = hearingGain;
			gainSquareSum += hearingGain * hearingGain;

			const phase = randomInRange(0, TWO_PI);
			const step = TWO_PI * harmonicFrequencyHz * this.invSampleRate;
			this.carrierSin[i] = Math.sin(phase);
			this.carrierCos[i] = Math.cos(phase);
			this.stepSin[i] = Math.sin(step);
			this.stepCos[i] = Math.cos(step);
		}

		const energyNorm = gainSquareSum > 0 ? 1 / Math.sqrt(gainSquareSum) : 0;
		this.outputScale = this.config.sessionGain * energyNorm;
		this.segmentSampleIndex = 0;
	}

	process(_inputs, outputs) {
		const output = outputs[0];
		if (!output || output.length === 0) {
			return true;
		}

		const frameSize = output[0].length;
		for (let sampleIndex = 0; sampleIndex < frameSize; sampleIndex += 1) {
			if (this.segmentSampleIndex >= this.segmentSampleCount) {
				this._startNewSegment();
			}

			if (this.harmonicCount === 0) {
				for (let channel = 0; channel < output.length; channel += 1) {
					output[channel][sampleIndex] = 0;
				}
				this.segmentSampleIndex += 1;
				continue;
			}

			const t = this.segmentSampleIndex * this.invSampleRate;
			const spectralRate = SMR_MEAN + SMR_VARIABILITY * Math.sin(this.p + TWO_PI * SMR_CHANGE_RATE_HZ * t);
			const commonTemporalTerm = TWO_PI * TEMPORAL_MODULATION_RATE_HZ * t;
			let sampleValue = 0;

			for (let harmonicIndex = 0; harmonicIndex < this.harmonicCount; harmonicIndex += 1) {
				let amplitude = 1;
				if (this.harmonicInBand[harmonicIndex]) {
					amplitude = 1 + AMPLITUDE_MODULATION_DEPTH * Math.sin(
						commonTemporalTerm + TWO_PI * this.harmonicFn[harmonicIndex] * spectralRate + this.q,
					);
				}

				sampleValue += this.harmonicGain[harmonicIndex] * amplitude * this.carrierSin[harmonicIndex];

				const nextSin = this.carrierSin[harmonicIndex] * this.stepCos[harmonicIndex]
					+ this.carrierCos[harmonicIndex] * this.stepSin[harmonicIndex];
				const nextCos = this.carrierCos[harmonicIndex] * this.stepCos[harmonicIndex]
					- this.carrierSin[harmonicIndex] * this.stepSin[harmonicIndex];
				this.carrierSin[harmonicIndex] = nextSin;
				this.carrierCos[harmonicIndex] = nextCos;
			}

			const value = sampleValue
				* this.outputScale
				* this.segmentEnvelope[this.segmentSampleIndex];
			for (let channel = 0; channel < output.length; channel += 1) {
				output[channel][sampleIndex] = value;
			}

			this.segmentSampleIndex += 1;
		}

		return true;
	}
}

registerProcessor('decorr-am-processor', DecorrAMProcessor);
