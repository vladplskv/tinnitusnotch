import {
	createDecorrAMModule,
	loadDecorrAMProcessorModule,
	setDecorrAMConfig,
} from './decorr-am';
import {buildDecorrProcessorConfig} from './decorr/config';
import {
	DEFAULT_DECORR_SAMPLE_RATE,
	TINNITUS_MATCH_FREQUENCIES_HZ,
} from './decorr/constants';
import {selectTinnitusMatch} from './decorr/matcher';
import type {
	DecorrConfig,
	DecorrMode,
	MatchResult,
} from './decorr/types';
import {
	createWhiteNoiseModule,
	loadWhiteNoiseProcessorModule,
} from './white-noise';

export type PlayState = 'idle' | 'sound' | 'noise' | 'decorr-am-active' | 'decorr-am-sham';

const DEFAULT_DECORR_CONFIG: DecorrConfig = {
	mode: 'active',
	tinnitusHz: 3000,
	tinnitusType: 'tone',
	hearingProfile: 'normal',
	sessionGain: 0.2,
};

const DEFAULT_AUDIBLE_MAP: Record<number, boolean> = Object.fromEntries(
	TINNITUS_MATCH_FREQUENCIES_HZ.map((frequencyHz) => [frequencyHz, true]),
);

export class AudioGenerator {
	state: PlayState = 'idle';
	volume: number;
	frequency: number;
	qFactor: number;

	decorrConfig: DecorrConfig = {...DEFAULT_DECORR_CONFIG};
	decorrMatchResult: MatchResult = selectTinnitusMatch({
		selectedHz: DEFAULT_DECORR_CONFIG.tinnitusHz,
		audibleMap: DEFAULT_AUDIBLE_MAP,
	});

	ctx: AudioContext;
	gainNode: GainNode;
	analyzerNode: AnalyserNode;
	outputNode: AudioNode;
	oscillatorNode: OscillatorNode = null;
	filterNode: BiquadFilterNode = null;
	noiseNode: AudioWorkletNode = null;
	decorrNode: AudioWorkletNode = null;

	frequencyData: Uint8Array = new Uint8Array(0);

	constructor(
		volume: number = 10,
		frequency: number = 3000,
		qFactor: number = 1,
		sampleRate: number = DEFAULT_DECORR_SAMPLE_RATE,
	) {
		try {
			this.ctx = new AudioContext({sampleRate});
		} catch {
			this.ctx = new AudioContext();
		}

		this.setVolume(volume);
		this.setFrequency(frequency);
		this.setQFactor(qFactor);
	}

	async initModules() {
		await Promise.all([
			loadWhiteNoiseProcessorModule(this.ctx),
			loadDecorrAMProcessorModule(this.ctx),
		]);

		this.analyzerNode = new AnalyserNode(this.ctx, {
			fftSize: 256,
		});
		this.frequencyData = new Uint8Array(this.analyzerNode.frequencyBinCount);
		this.analyzerNode.connect(this.ctx.destination);

		this.gainNode = this.ctx.createGain();
		this.gainNode.connect(this.analyzerNode);

		this.outputNode = this.gainNode;
	}

	setVolume(volume: number) {
		this.volume = volume;
		if (this.gainNode) {
			this.gainNode.gain.value = volume;
		}
	}

	setFrequency(frequency: number) {
		this.frequency = frequency;

		if (this.oscillatorNode) {
			this.oscillatorNode.frequency.value = frequency;
		}
		if (this.filterNode) {
			this.filterNode.frequency.value = frequency;
		}
	}

	setQFactor(factor: number) {
		this.qFactor = factor;

		if (this.filterNode) {
			this.filterNode.Q.value = factor;
		}
	}

	setDecorrConfig(config: DecorrConfig): void {
		this.decorrConfig = {
			...config,
			sessionGain: Math.min(Math.max(config.sessionGain, 0), 1),
		};
		this.updateDecorrNodeConfig();
	}

	setDecorrMatchResult(matchResult: MatchResult): void {
		this.decorrMatchResult = {
			matchedHz: matchResult.matchedHz,
			activeBand: [...matchResult.activeBand],
			shamBand: [...matchResult.shamBand],
		};
		this.updateDecorrNodeConfig();
	}

	async startDecorrAM(mode: DecorrMode = this.decorrConfig.mode): Promise<void> {
		await this.setState(mode === 'active' ? 'decorr-am-active' : 'decorr-am-sham');
	}

	async stopDecorrAM(): Promise<void> {
		await this.setState('idle');
	}

	private resolveDecorrModeFromState(): DecorrMode {
		if (this.state === 'decorr-am-sham') {
			return 'sham';
		}
		return 'active';
	}

	private updateDecorrNodeConfig(): void {
		if (!this.decorrNode) {
			return;
		}

		const mode = this.resolveDecorrModeFromState();
		const processorConfig = buildDecorrProcessorConfig(this.decorrConfig, this.decorrMatchResult, mode);
		setDecorrAMConfig(this.decorrNode, processorConfig);
	}

	private async unmount() {
		if (this.oscillatorNode) {
			this.oscillatorNode.stop(0);
			this.oscillatorNode.disconnect();
			this.oscillatorNode = null;
		}

		if (this.filterNode) {
			this.filterNode.disconnect();
			this.filterNode = null;
		}

		if (this.noiseNode) {
			this.noiseNode.disconnect();
			this.noiseNode = null;
		}

		if (this.decorrNode) {
			this.decorrNode.disconnect();
			this.decorrNode = null;
		}

		await this.ctx.suspend();
	}

	private startOscillator(): void {
		this.oscillatorNode = new OscillatorNode(this.ctx);
		this.oscillatorNode.connect(this.outputNode);
		this.setFrequency(this.frequency);

		this.oscillatorNode.start(0);
	}

	private startNoise() {
		this.filterNode = new BiquadFilterNode(this.ctx, {
			type: 'notch',
		});
		this.setFrequency(this.frequency);
		this.filterNode.Q.value = this.qFactor;

		this.noiseNode = createWhiteNoiseModule(this.ctx);
		this.noiseNode.connect(this.filterNode);
		this.filterNode.connect(this.outputNode);
	}

	private startDecorr(mode: DecorrMode) {
		this.decorrNode = createDecorrAMModule(this.ctx);
		this.decorrNode.connect(this.outputNode);
		const processorConfig = buildDecorrProcessorConfig(this.decorrConfig, this.decorrMatchResult, mode);
		setDecorrAMConfig(this.decorrNode, processorConfig);
	}

	async setState(state: PlayState = 'idle') {
		if (state === this.state) {
			return;
		}

		await this.unmount();

		if (state === 'sound') {
			this.startOscillator();
		} else if (state === 'noise') {
			this.startNoise();
		} else if (state === 'decorr-am-active') {
			this.startDecorr('active');
		} else if (state === 'decorr-am-sham') {
			this.startDecorr('sham');
		}

		if (state !== 'idle') {
			await this.ctx.resume();
		}

		this.state = state;
	}

	getByteFrequencyData(): Uint8Array {
		if (!this.analyzerNode) {
			return this.frequencyData;
		}

		this.analyzerNode.getByteFrequencyData(this.frequencyData);
		return this.frequencyData;
	}
}

export type {
	DecorrConfig,
	DecorrMode,
	HearingProfile,
	MatchResult,
	TinnitusType,
} from './decorr/types';
export {MODULATION_BANDS_HZ, TINNITUS_MATCH_FREQUENCIES_HZ} from './decorr/constants';
export {buildDecorrProcessorConfig} from './decorr/config';
export {selectTinnitusMatch} from './decorr/matcher';
