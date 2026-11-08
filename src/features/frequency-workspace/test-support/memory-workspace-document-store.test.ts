import { describe, expect, it, vi } from 'vitest';

import { MemoryWorkspaceDocumentStore } from './memory-workspace-document-store';

describe('MemoryWorkspaceDocumentStore', () => {
  it('enforces revisions and returns the exact conflicting raw value', () => {
    const store = new MemoryWorkspaceDocumentStore();
    const revision1 = JSON.stringify({ schemaVersion: 1, revision: 1 });
    const revision2 = JSON.stringify({ schemaVersion: 1, revision: 2 });

    expect(store.load()).toEqual({ kind: 'missing' });
    expect(
      store.commit({
        rawValue: revision1,
        revision: 1,
        expectedRevision: null,
      }),
    ).toEqual({ kind: 'committed', revision: 1 });
    expect(store.load()).toEqual({ kind: 'stored', rawValue: revision1 });
    expect(
      store.commit({
        rawValue: revision2,
        revision: 2,
        expectedRevision: null,
      }),
    ).toEqual({ kind: 'conflict', currentRawValue: revision1 });
    expect(store.remove(null)).toEqual({
      kind: 'conflict',
      currentRawValue: revision1,
    });
    expect(store.remove(1)).toEqual({ kind: 'removed' });
    expect(store.load()).toEqual({ kind: 'missing' });
  });

  it('reports unavailable storage without mutating data', () => {
    const cause = new Error('quota');
    const store = new MemoryWorkspaceDocumentStore(
      JSON.stringify({ schemaVersion: 1, revision: 3 }),
    );
    store.setUnavailable(cause);

    expect(store.load()).toEqual({ kind: 'unavailable', cause });
    expect(
      store.commit({ rawValue: '{}', revision: 4, expectedRevision: 3 }),
    ).toEqual({ kind: 'unavailable', cause });
    expect(store.remove(3)).toEqual({ kind: 'unavailable', cause });

    store.setUnavailable(null);
    expect(store.load()).toMatchObject({ kind: 'stored' });
  });

  it('notifies subscribers only for simulated external changes', () => {
    const store = new MemoryWorkspaceDocumentStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.commit({
      rawValue: JSON.stringify({ schemaVersion: 1, revision: 1 }),
      revision: 1,
      expectedRevision: null,
    });
    expect(listener).not.toHaveBeenCalled();

    const external = JSON.stringify({ schemaVersion: 1, revision: 2 });
    store.simulateExternalChange(external);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ rawValue: external });

    unsubscribe();
    store.simulateExternalChange(null);
    expect(listener).toHaveBeenCalledOnce();
  });
});
