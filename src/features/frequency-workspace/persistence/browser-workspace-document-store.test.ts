import { describe, expect, it, vi } from 'vitest';

import { WORKSPACE_STORAGE_KEY } from './workspace-document-store';
import { createBrowserWorkspaceDocumentStore } from './browser-workspace-document-store';

class FakeStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FakeStorageEventTarget {
  private listener: ((event: StorageEvent) => void) | null = null;

  addEventListener(_type: 'storage', listener: (event: StorageEvent) => void) {
    this.listener = listener;
  }
  removeEventListener(
    _type: 'storage',
    listener: (event: StorageEvent) => void,
  ) {
    if (this.listener === listener) this.listener = null;
  }
  emit(event: Pick<StorageEvent, 'key' | 'newValue' | 'storageArea'>) {
    this.listener?.(event as StorageEvent);
  }
}

describe('browser workspace document store', () => {
  it('reads and writes only the new workspace key while retaining legacy keys', () => {
    const storage = new FakeStorage();
    storage.setItem('frequency', '9000');
    storage.setItem('decorr-mode', 'sham');
    const store = createBrowserWorkspaceDocumentStore({
      getStorage: () => storage,
      eventTarget: new FakeStorageEventTarget(),
    });
    const rawValue = JSON.stringify({ schemaVersion: 1, revision: 1 });

    expect(store.load()).toEqual({ kind: 'missing' });
    expect(
      store.commit({ rawValue, revision: 1, expectedRevision: null }),
    ).toEqual({ kind: 'committed', revision: 1 });
    expect(storage.getItem('frequency')).toBe('9000');
    expect(storage.getItem('decorr-mode')).toBe('sham');
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe(rawValue);

    expect(store.remove(1)).toEqual({ kind: 'removed' });
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('frequency')).toBe('9000');
    expect(storage.getItem('decorr-mode')).toBe('sham');
  });

  it('turns browser access failures into unavailable results', () => {
    const cause = new Error('SecurityError');
    const store = createBrowserWorkspaceDocumentStore({
      getStorage: () => {
        throw cause;
      },
      eventTarget: new FakeStorageEventTarget(),
    });

    expect(store.load()).toEqual({ kind: 'unavailable', cause });
    expect(store.remove(null)).toEqual({ kind: 'unavailable', cause });
    expect(
      store.commit({
        rawValue: JSON.stringify({ schemaVersion: 1, revision: 1 }),
        revision: 1,
        expectedRevision: null,
      }),
    ).toEqual({ kind: 'unavailable', cause });
  });

  it('reports only external changes for the workspace key and storage area', () => {
    const storage = new FakeStorage();
    const anotherStorage = new FakeStorage();
    const eventTarget = new FakeStorageEventTarget();
    const store = createBrowserWorkspaceDocumentStore({
      getStorage: () => storage,
      eventTarget,
    });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    eventTarget.emit({
      key: 'frequency',
      newValue: '5000',
      storageArea: storage,
    });
    eventTarget.emit({
      key: WORKSPACE_STORAGE_KEY,
      newValue: '{}',
      storageArea: anotherStorage,
    });
    expect(listener).not.toHaveBeenCalled();

    eventTarget.emit({
      key: WORKSPACE_STORAGE_KEY,
      newValue: '{"revision":2}',
      storageArea: storage,
    });
    expect(listener).toHaveBeenCalledWith({ rawValue: '{"revision":2}' });

    unsubscribe();
    eventTarget.emit({
      key: WORKSPACE_STORAGE_KEY,
      newValue: null,
      storageArea: storage,
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});
