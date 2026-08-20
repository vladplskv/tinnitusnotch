import type {
  SpectrumFrameMetadata,
  TherapyPlayback,
  TherapyPlaybackError,
  TherapyPlaybackIntent,
  TherapyPlaybackSnapshot,
} from '../playback/contracts';

const METADATA: SpectrumFrameMetadata = {
  sampleRate: 44_100,
  fftSize: 8_192,
  minDecibels: -100,
  maxDecibels: 0,
  smoothing: 0.8,
};

export class FakeTherapyPlayback implements TherapyPlayback {
  readonly intents: TherapyPlaybackIntent[] = [];
  readonly #listeners = new Set<(snapshot: TherapyPlaybackSnapshot) => void>();
  readonly #spectrum = new Float32Array(METADATA.fftSize / 2).fill(
    METADATA.minDecibels,
  );
  #snapshot: TherapyPlaybackSnapshot = {
    status: 'stopped',
    source: { kind: 'none' },
    error: null,
    spectrum: METADATA,
  };
  #disposed = false;

  getSnapshot(): TherapyPlaybackSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: TherapyPlaybackSnapshot) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispatch(intent: TherapyPlaybackIntent): void {
    if (this.#disposed) return;
    this.intents.push(intent);

    switch (intent.type) {
      case 'preview-matching-stimulus':
        this.#publish({
          status: 'previewing',
          source: { kind: 'matching-stimulus' },
          error: null,
        });
        break;
      case 'preview-hearing-correction':
        this.#publish({
          status: 'previewing',
          source: {
            kind: 'hearing-correction-preview',
            hearingCorrection: intent.hearingCorrection,
          },
          error: null,
        });
        break;
      case 'start-therapy':
        this.#publish({
          status: 'playing',
          source: {
            kind: 'therapy-filter',
            filterId: intent.session.selectedFilterId,
          },
          error: null,
        });
        break;
      case 'pause':
        if (this.#snapshot.status === 'playing') {
          this.#publish({ status: 'paused' });
        }
        break;
      case 'continue':
        if (this.#snapshot.status === 'paused') {
          this.#publish({ status: 'playing', error: null });
        }
        break;
      case 'stop':
        this.#publish({
          status: 'stopped',
          source: { kind: 'none' },
          error: null,
        });
        break;
      case 'retry':
        this.#publish({
          status: 'stopped',
          source: { kind: 'none' },
          error: null,
        });
        break;
      case 'apply-live-session':
        break;
    }
  }

  readSpectrum(target: Float32Array): SpectrumFrameMetadata {
    if (
      this.#snapshot.status !== 'playing' &&
      this.#snapshot.status !== 'previewing'
    ) {
      target.fill(METADATA.minDecibels);
      return METADATA;
    }

    target.set(this.#spectrum.subarray(0, target.length));
    return METADATA;
  }

  setSpectrum(values: ArrayLike<number>): void {
    this.#spectrum.fill(METADATA.minDecibels);
    this.#spectrum.set(Array.from(values).slice(0, this.#spectrum.length));
  }

  fail(error: TherapyPlaybackError): void {
    this.#publish({ status: 'error', source: { kind: 'none' }, error });
  }

  interrupt(): void {
    if (this.#snapshot.status === 'playing') {
      this.#publish({ status: 'paused' });
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    this.#snapshot = {
      ...this.#snapshot,
      status: 'stopped',
      source: { kind: 'none' },
      error: null,
    };
  }

  #publish(next: Partial<TherapyPlaybackSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...next };
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

export function createFakeTherapyPlayback(): FakeTherapyPlayback {
  return new FakeTherapyPlayback();
}
