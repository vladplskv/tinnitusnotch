import moduleScript from './decorr/decorr-am-processor.worklet.mjs?raw';
import type {DecorrProcessorConfig} from './decorr/config';

const scriptURL = URL.createObjectURL(new Blob([moduleScript], {type: 'text/javascript'}));

export async function loadDecorrAMProcessorModule(ctx: AudioContext) {
	await ctx.audioWorklet.addModule(scriptURL);
}

export function createDecorrAMModule(ctx: AudioContext) {
	return new AudioWorkletNode(ctx, 'decorr-am-processor', {
		numberOfOutputs: 1,
		outputChannelCount: [2],
	});
}

export function setDecorrAMConfig(node: AudioWorkletNode, config: DecorrProcessorConfig) {
	node.port.postMessage({
		type: 'config',
		payload: config,
	});
}
