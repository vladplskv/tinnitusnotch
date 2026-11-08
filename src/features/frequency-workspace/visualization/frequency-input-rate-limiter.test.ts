import { describe, expect, test, vi } from 'vitest';

import { createFrequencyInputRateLimiter } from './frequency-input-rate-limiter';

describe('Frequency Visualization pointer input', () => {
  test('emits at most 30 previews per second and keeps the latest value', () => {
    let now = 0;
    let scheduled: (() => void) | null = null;
    const preview = vi.fn();
    const limiter = createFrequencyInputRateLimiter({
      now: () => now,
      schedule: callback => {
        scheduled = callback;
        return () => {
          scheduled = null;
        };
      },
      onPreview: preview,
      onCommit: vi.fn(),
    });

    limiter.preview(1_000);
    now = 10;
    limiter.preview(2_000);
    limiter.preview(3_000);

    expect(preview).toHaveBeenCalledTimes(1);
    expect(scheduled).not.toBeNull();

    now = 34;
    (scheduled as unknown as () => void)();
    expect(preview.mock.calls).toEqual([[1_000], [3_000]]);
  });

  test('commits once on release and cancels a pending preview', () => {
    let scheduled: (() => void) | null = null;
    const commit = vi.fn();
    const limiter = createFrequencyInputRateLimiter({
      now: () => 0,
      schedule: callback => {
        scheduled = callback;
        return () => {
          scheduled = null;
        };
      },
      onPreview: vi.fn(),
      onCommit: commit,
    });

    limiter.preview(1_000);
    limiter.preview(2_000);
    limiter.commit(2_500);

    expect(scheduled).toBeNull();
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(2_500);
  });
});
