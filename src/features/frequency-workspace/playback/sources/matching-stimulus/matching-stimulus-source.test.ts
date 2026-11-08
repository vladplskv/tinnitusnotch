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

async function renderHearingCorrection(
  hearingCorrection: 'a1' | 'a2' | 'c1' | 'c2',
) {
  const source = new FakeBufferSource();
  const context = {
    sampleRate: 44_100,
    createBuffer: (_channels: number, length: number, sampleRate: number) =>
      new FakeBuffer(length, sampleRate),
    createBufferSource: () => source,
  } as unknown as AudioContext;

  const running = await matchingStimulusSourceFactory.create({
    context,
    output: {} as AudioNode,
    configuration: { kind: 'hearing-correction-preview', hearingCorrection },
    signal: new AbortController().signal,
  });
  return { source, running, buffer: source.buffer as unknown as FakeBuffer };
}

const rms = (samples: Float32Array) =>
  Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
  );

describe('Matching Stimulus source', () => {
  it('renders the selected low-volume Hearing Correction as a looping 17-tone sequence', async () => {
    const { source, running, buffer } = await renderHearingCorrection('c2');

    const toneSamples = Math.round(44_100 * 0.4);
    expect(buffer.length).toBe(toneSamples * 17);
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledOnce();

    let peak = 0;
    for (const sample of buffer.samples)
      peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeLessThanOrEqual(0.1);
    for (let tone = 0; tone < 17; tone += 1) {
      expect(buffer.samples[tone * toneSamples]).toBe(0);
    }

    await running.dispose();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });

  it('plays every Hearing Correction profile at the same overall level', async () => {
    const levels = await Promise.all(
      (['a1', 'a2', 'c1', 'c2'] as const).map(async correction => {
        const { buffer, running } = await renderHearingCorrection(correction);
        await running.dispose();
        return rms(buffer.samples);
      }),
    );

    for (const level of levels) expect(level).toBeCloseTo(levels[0]!, 3);
  });
});
