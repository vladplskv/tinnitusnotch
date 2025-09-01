import {
	createWhiteNoiseModule,
	loadWhiteNoiseProcessorModule,
} from './white-noise';

export type PlayState = 'idle' | 'sound' | 'noise';

export class AudioGenerator {
	state: PlayState = 'idle';
	volume: number;
	frequency: number;
	qFactor: number;

	ctx: AudioContext;
	gainNode: GainNode;
	analyzerNode: AnalyserNode;
	outputNode: AudioNode;
	oscillatorNode: OscillatorNode = null;
	filterNode: BiquadFilterNode = null;

	frequencyData: Uint8Array;

	constructor(volume: number = 10, frequency: number = 3000, qFactor: number = 1) {
		this.ctx = new AudioContext();


		this.setVolume(volume);
		this.setFrequency(frequency);
		this.setQFactor(qFactor);
	}

	async initModules() {
		await loadWhiteNoiseProcessorModule(this.ctx);

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

		const processor = createWhiteNoiseModule(this.ctx);

		processor.connect(this.filterNode);
		this.filterNode.connect(this.outputNode);
	}

	async setState(state: PlayState = 'idle') {
		await this.unmount();

		if (state === 'sound') {
			this.startOscillator();
		} else if (state === 'noise') {
			this.startNoise();
		}

		if (state !== 'idle') {
			await this.ctx.resume();
		}

		this.state = state;
	}

	getByteFrequencyData(): Uint8Array {
		this.analyzerNode.getByteFrequencyData(this.frequencyData);
		return this.frequencyData;
	};
}
