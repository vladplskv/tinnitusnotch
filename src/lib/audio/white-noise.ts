import moduleScript from './white-noise-processor-worklet.mjs?raw';

const scriptURL = URL.createObjectURL(new Blob([moduleScript], {type: 'text/javascript'}));

export async function loadWhiteNoiseProcessorModule(ctx: AudioContext) {
	await ctx.audioWorklet.addModule(scriptURL);
}

export function createWhiteNoiseModule(ctx: AudioContext) {
	return new AudioWorkletNode(ctx, 'white-noise-processor');
}
