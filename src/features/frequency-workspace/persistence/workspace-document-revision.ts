import type { WorkspaceDocumentCommitRequest } from './workspace-document-store';

export function readWorkspaceRevision(
  rawValue: string | null,
): number | null | undefined {
  if (rawValue === null) return null;
  try {
    const value = JSON.parse(rawValue) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'revision' in value &&
      Number.isInteger(value.revision) &&
      (value.revision as number) >= 1
    ) {
      return value.revision as number;
    }
  } catch {
    // A corrupt current value is a conflict, never an empty document.
  }
  return undefined;
}

export function assertWorkspaceCommitRequest(
  request: WorkspaceDocumentCommitRequest,
) {
  const encodedRevision = readWorkspaceRevision(request.rawValue);
  if (encodedRevision !== request.revision) {
    throw new Error(
      'Commit revision must match the encoded workspace revision',
    );
  }
  if (
    request.revision !==
    (request.expectedRevision === null ? 1 : request.expectedRevision + 1)
  ) {
    throw new Error('Workspace revisions must increase by exactly one');
  }
}
