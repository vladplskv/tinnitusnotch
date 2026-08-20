import type {
  WorkspaceDocumentCommitRequest,
  WorkspaceDocumentCommitResult,
  WorkspaceDocumentExternalChange,
  WorkspaceDocumentLoadResult,
  WorkspaceDocumentRemoveResult,
  WorkspaceDocumentStore,
} from '../persistence/workspace-document-store';
import {
  assertWorkspaceCommitRequest,
  readWorkspaceRevision,
} from '../persistence/workspace-document-revision';

export class MemoryWorkspaceDocumentStore implements WorkspaceDocumentStore {
  private rawValue: string | null;
  private unavailableCause: unknown | null = null;
  private readonly listeners = new Set<
    (change: WorkspaceDocumentExternalChange) => void
  >();

  constructor(initialRawValue: string | null = null) {
    this.rawValue = initialRawValue;
  }

  load(): WorkspaceDocumentLoadResult {
    if (this.unavailableCause !== null) {
      return { kind: 'unavailable', cause: this.unavailableCause };
    }
    return this.rawValue === null
      ? { kind: 'missing' }
      : { kind: 'stored', rawValue: this.rawValue };
  }

  commit(
    request: WorkspaceDocumentCommitRequest,
  ): WorkspaceDocumentCommitResult {
    if (this.unavailableCause !== null) {
      return { kind: 'unavailable', cause: this.unavailableCause };
    }
    if (readWorkspaceRevision(this.rawValue) !== request.expectedRevision) {
      return { kind: 'conflict', currentRawValue: this.rawValue };
    }
    assertWorkspaceCommitRequest(request);
    this.rawValue = request.rawValue;
    return { kind: 'committed', revision: request.revision };
  }

  remove(expectedRevision: number | null): WorkspaceDocumentRemoveResult {
    if (this.unavailableCause !== null) {
      return { kind: 'unavailable', cause: this.unavailableCause };
    }
    if (readWorkspaceRevision(this.rawValue) !== expectedRevision) {
      return { kind: 'conflict', currentRawValue: this.rawValue };
    }
    this.rawValue = null;
    return { kind: 'removed' };
  }

  subscribe(
    listener: (change: WorkspaceDocumentExternalChange) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setUnavailable(cause: unknown | null) {
    this.unavailableCause = cause;
  }

  simulateExternalChange(rawValue: string | null) {
    this.rawValue = rawValue;
    for (const listener of this.listeners) listener({ rawValue });
  }
}
