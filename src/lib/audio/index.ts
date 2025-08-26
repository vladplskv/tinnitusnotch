import {
	createWhiteNoiseModule,
	loadWhiteNoiseProcessorModule,
} from './white-noise';

export type PlayState = 'idle' | 'sound' | 'noise';

export class AudioGenerator {
	state: PlayState = 'idle';
	volume: number;
	frequency: number;

	ctx: AudioContext;
	gainNode: GainNode;
	oscillatorNode: OscillatorNode = null;
	filterNode: BiquadFilterNode = null;

	constructor(volume: number = 10, frequency: number = 3000) {
		this.ctx = new AudioContext();

		this.setVolume(volume);
		this.setFrequency(frequency);
	}

	async initModules() {
		await loadWhiteNoiseProcessorModule(this.ctx);

		this.gainNode = this.ctx.createGain();
		this.gainNode.connect(this.ctx.destination);
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
		this.oscillatorNode = this.ctx.createOscillator();
		this.oscillatorNode.connect(this.gainNode);
		this.setFrequency(this.frequency);

		this.oscillatorNode.start(0);
	}

	private startNoise() {
		this.filterNode = this.ctx.createBiquadFilter();
		this.filterNode.type = 'notch';
		this.setFrequency(this.frequency);
		this.filterNode.Q.value = 1;

		const processor = createWhiteNoiseModule(this.ctx);

		processor.connect(this.filterNode);
		this.filterNode.connect(this.gainNode);
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
}
