import { describe, expect, it, vi } from 'vitest';

import { matchingStimulusSourceFactory } from './matching-stimulus-source';

class FakeBuffer {
  readonly samples: Float32Array;

  constructor(
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.samples = new Float32Array(length);
  }

  getChannelData() {
    return this.samples;
  }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

describe('Matching Stimulus source', () => {
  it('renders the selected low-volume Hearing Correction as a looping 17-tone sequence', async () => {
    const source = new FakeBufferSource();
    const context = {
      sampleRate: 44_100,
      createBuffer: (_channels: number, length: number, sampleRate: number) =>
        new FakeBuffer(length, sampleRate),
      createBufferSource: () => source,
    } as unknown as AudioContext;
    const output = {} as AudioNode;

    const running = await matchingStimulusSourceFactory.create({
      context,
      output,
      configuration: {
        kind: 'hearing-correction-preview',
        hearingCorrection: 'c2',
      },
      signal: new AbortController().signal,
    });

    const buffer = source.buffer as unknown as FakeBuffer;
    const toneSamples = Math.round(44_100 * 0.4);
    expect(buffer.length).toBe(toneSamples * 17);
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledOnce();

    let peak = 0;
    for (const sample of buffer.samples)
      peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeLessThanOrEqual(0.05);
    for (let tone = 0; tone < 17; tone += 1) {
      expect(buffer.samples[tone * toneSamples]).toBe(0);
    }

    await running.dispose();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });
});
