import {
  assertWorkspaceCommitRequest,
  readWorkspaceRevision,
} from './workspace-document-revision';
import {
  WORKSPACE_STORAGE_KEY,
  type WorkspaceDocumentCommitRequest,
  type WorkspaceDocumentCommitResult,
  type WorkspaceDocumentExternalChange,
  type WorkspaceDocumentLoadResult,
  type WorkspaceDocumentRemoveResult,
  type WorkspaceDocumentStore,
} from './workspace-document-store';

interface StorageEventTarget {
  addEventListener(
    type: 'storage',
    listener: (event: StorageEvent) => void,
  ): void;
  removeEventListener(
    type: 'storage',
    listener: (event: StorageEvent) => void,
  ): void;
}

export interface BrowserWorkspaceDocumentStoreOptions {
  readonly getStorage?: () => Storage;
  readonly eventTarget?: StorageEventTarget;
}

export function createBrowserWorkspaceDocumentStore(
  options: BrowserWorkspaceDocumentStoreOptions = {},
): WorkspaceDocumentStore {
  const getStorage = options.getStorage ?? (() => window.localStorage);
  const eventTarget: StorageEventTarget = options.eventTarget ?? {
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener),
  };

  return {
    load(): WorkspaceDocumentLoadResult {
      try {
        const rawValue = getStorage().getItem(WORKSPACE_STORAGE_KEY);
        return rawValue === null
          ? { kind: 'missing' }
          : { kind: 'stored', rawValue };
      } catch (cause) {
        return { kind: 'unavailable', cause };
      }
    },

    commit(
      request: WorkspaceDocumentCommitRequest,
    ): WorkspaceDocumentCommitResult {
      let storage: Storage;
      let currentRawValue: string | null;
      try {
        storage = getStorage();
        currentRawValue = storage.getItem(WORKSPACE_STORAGE_KEY);
      } catch (cause) {
        return { kind: 'unavailable', cause };
      }
      if (readWorkspaceRevision(currentRawValue) !== request.expectedRevision) {
        return { kind: 'conflict', currentRawValue };
      }
      assertWorkspaceCommitRequest(request);
      try {
        storage.setItem(WORKSPACE_STORAGE_KEY, request.rawValue);
        return { kind: 'committed', revision: request.revision };
      } catch (cause) {
        return { kind: 'unavailable', cause };
      }
    },

    remove(expectedRevision: number | null): WorkspaceDocumentRemoveResult {
      try {
        const storage = getStorage();
        const currentRawValue = storage.getItem(WORKSPACE_STORAGE_KEY);
        if (readWorkspaceRevision(currentRawValue) !== expectedRevision) {
          return { kind: 'conflict', currentRawValue };
        }
        storage.removeItem(WORKSPACE_STORAGE_KEY);
        return { kind: 'removed' };
      } catch (cause) {
        return { kind: 'unavailable', cause };
      }
    },

    subscribe(
      listener: (change: WorkspaceDocumentExternalChange) => void,
    ): () => void {
      const handleStorage = (event: StorageEvent) => {
        try {
          if (
            event.key === WORKSPACE_STORAGE_KEY &&
            event.storageArea === getStorage()
          ) {
            listener({ rawValue: event.newValue });
          }
        } catch {
          // Access failures surface through load/commit. A storage event cannot
          // provide a stable conflict value while its storage area is blocked.
        }
      };
      eventTarget.addEventListener('storage', handleStorage);
      return () => eventTarget.removeEventListener('storage', handleStorage);
    },
  };
}
