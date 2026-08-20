import {
  createPaper2025V1Renderer,
  type Paper2025V1Configuration,
} from '../dsp/paper-2025-v1';

interface WorkletProcessorOptions {
  readonly processorOptions?: Omit<Paper2025V1Configuration, 'sampleRate'>;
}

interface WorkletOutputEvent {
  readonly type: 'ready' | 'error';
  readonly message?: string;
}

declare const sampleRate: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: WorkletProcessorOptions);
}

declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor,
): void;

class DecorrelatingAMProcessor extends AudioWorkletProcessor {
  readonly #renderer;
  #reportedFirstBlock = false;

  constructor(options?: WorkletProcessorOptions) {
    super(options);

    const configuration = options?.processorOptions;
    if (!configuration) {
      throw new TypeError('Missing paper-2025-v1 processor configuration');
    }

    this.#renderer = createPaper2025V1Renderer({
      ...configuration,
      sampleRate,
    });
    this.port.postMessage({ type: 'ready' } satisfies WorkletOutputEvent);
  }

  process(
    _inputs: readonly (readonly Float32Array[])[],
    outputs: readonly (readonly Float32Array[])[],
  ): boolean {
    const output = outputs[0];
    const mono = output?.[0];
    if (!mono) {
      return true;
    }

    try {
      this.#renderer.process(mono);
      for (let channel = 1; channel < output.length; channel += 1) {
        output[channel].set(mono);
      }
      if (!this.#reportedFirstBlock) {
        this.#reportedFirstBlock = true;
        this.port.postMessage({ type: 'processed' });
      }
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      } satisfies WorkletOutputEvent);
      return false;
    }

    return true;
  }
}

registerProcessor('decorrelating-am-paper-2025-v1', DecorrelatingAMProcessor);
