const PREVIEW_INTERVAL_MS = 1_000 / 30;

export interface FrequencyInputRateLimiterOptions {
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
  readonly onPreview: (frequencyHz: number) => void;
  readonly onCommit: (frequencyHz: number) => void;
}

export interface FrequencyInputRateLimiter {
  preview(frequencyHz: number): void;
  commit(frequencyHz: number): void;
  dispose(): void;
}

export function createFrequencyInputRateLimiter(
  options: FrequencyInputRateLimiterOptions,
): FrequencyInputRateLimiter {
  let lastEmission = Number.NEGATIVE_INFINITY;
  let pendingFrequencyHz: number | null = null;
  let cancelScheduled: (() => void) | null = null;

  function preview(frequencyHz: number) {
    const elapsed = options.now() - lastEmission;
    if (elapsed >= PREVIEW_INTERVAL_MS) {
      cancelPending();
      lastEmission = options.now();
      options.onPreview(frequencyHz);
      return;
    }

    pendingFrequencyHz = frequencyHz;
    if (cancelScheduled !== null) {
      return;
    }

    cancelScheduled = options.schedule(
      () => {
        cancelScheduled = null;
        if (pendingFrequencyHz === null) {
          return;
        }

        const nextFrequencyHz = pendingFrequencyHz;
        pendingFrequencyHz = null;
        lastEmission = options.now();
        options.onPreview(nextFrequencyHz);
      },
      Math.max(0, PREVIEW_INTERVAL_MS - elapsed),
    );
  }

  function cancelPending() {
    cancelScheduled?.();
    cancelScheduled = null;
    pendingFrequencyHz = null;
  }

  return {
    preview,
    commit(frequencyHz) {
      cancelPending();
      options.onCommit(frequencyHz);
    },
    dispose: cancelPending,
  };
}
