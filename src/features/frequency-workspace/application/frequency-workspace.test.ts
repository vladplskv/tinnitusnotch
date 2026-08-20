import { createFrequencyWorkspace } from '@/features/frequency-workspace';
import { describe, expect, it, vi } from 'vitest';

describe('FrequencyWorkspace', () => {
  it('starts booting with every user action disabled', async () => {
    const workspace = createFrequencyWorkspace();
    const listener = vi.fn();
    const unsubscribe = workspace.subscribe(listener);

    expect(workspace.getSnapshot()).toMatchObject({
      phase: 'booting',
      capabilities: {
        canContinue: false,
        canPause: false,
        canSavePreset: false,
        canStart: false,
        canStop: false,
      },
    });
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    await workspace.dispose();
    await expect(workspace.dispose()).resolves.toBeUndefined();
  });
});
