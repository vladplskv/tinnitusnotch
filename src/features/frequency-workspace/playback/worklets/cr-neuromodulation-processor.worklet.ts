import {
  createCRNeuromodulationRenderer,
  type CRNeuromodulationConfiguration,
} from '../dsp/cr-neuromodulation';

interface WorkletProcessorOptions {
  readonly processorOptions?: Omit<
    CRNeuromodulationConfiguration,
    'sampleRate'
  >;
}

interface WorkletOutputEvent {
  readonly type: 'ready' | 'processed' | 'error';
  readonly message?: string;
}

interface WorkletInputEvent {
  readonly type: 'set-tinnitus-frequency';
  readonly frequencyHz: number;
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

class CRNeuromodulationProcessor extends AudioWorkletProcessor {
  readonly #renderer;
  #reportedFirstBlock = false;

  constructor(options?: WorkletProcessorOptions) {
    super(options);

    const configuration = options?.processorOptions;
    if (!configuration) {
      throw new TypeError('Missing CR Neuromodulation processor configuration');
    }

    this.#renderer = createCRNeuromodulationRenderer({
      ...configuration,
      sampleRate,
    });
    this.port.onmessage = (event: MessageEvent<WorkletInputEvent>) => {
      if (event.data?.type === 'set-tinnitus-frequency') {
        this.#renderer.setTinnitusFrequency(event.data.frequencyHz);
      }
    };
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
        this.port.postMessage({
          type: 'processed',
        } satisfies WorkletOutputEvent);
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

registerProcessor('cr-neuromodulation', CRNeuromodulationProcessor);
