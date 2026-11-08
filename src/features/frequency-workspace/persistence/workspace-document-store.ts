export const WORKSPACE_STORAGE_KEY = 'tinnitusnotch.workspace.v1';

export type WorkspaceDocumentLoadResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'stored'; readonly rawValue: string }
  | {
      readonly kind: 'unavailable';
      readonly cause: unknown;
    };

export interface WorkspaceDocumentCommitRequest {
  readonly rawValue: string;
  readonly revision: number;
  readonly expectedRevision: number | null;
}

export type WorkspaceDocumentCommitResult =
  | { readonly kind: 'committed'; readonly revision: number }
  | {
      readonly kind: 'conflict';
      readonly currentRawValue: string | null;
    }
  | { readonly kind: 'unavailable'; readonly cause: unknown };

export type WorkspaceDocumentRemoveResult =
  | { readonly kind: 'removed' }
  | {
      readonly kind: 'conflict';
      readonly currentRawValue: string | null;
    }
  | { readonly kind: 'unavailable'; readonly cause: unknown };

export interface WorkspaceDocumentExternalChange {
  readonly rawValue: string | null;
}

export interface WorkspaceDocumentStore {
  load(): WorkspaceDocumentLoadResult;
  commit(
    request: WorkspaceDocumentCommitRequest,
  ): WorkspaceDocumentCommitResult;
  remove(
    expectedRevision: number | null | undefined,
  ): WorkspaceDocumentRemoveResult;
  subscribe(
    listener: (change: WorkspaceDocumentExternalChange) => void,
  ): () => void;
}
