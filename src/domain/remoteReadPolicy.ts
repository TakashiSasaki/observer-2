/**
 * Marks a remote document that violates the v2 Firestore data contract.
 * This is intentionally distinct from a transport/read failure: falling back
 * to a stale cache must never hide malformed canonical data.
 */
export class RemoteDataIntegrityError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = 'RemoteDataIntegrityError';
    this.originalError = originalError;
  }
}

export function isRemoteDataIntegrityError(error: unknown): error is RemoteDataIntegrityError {
  return error instanceof RemoteDataIntegrityError;
}

/** Wraps synchronous remote-document validation without changing its error class. */
export function withRemoteDataIntegrity<T>(entityName: string, documentId: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (isRemoteDataIntegrityError(error)) throw error;
    const detail = error instanceof Error ? error.message : 'unknown validation failure';
    throw new RemoteDataIntegrityError(
      `${entityName} ${documentId} violates the v2 Firestore data contract: ${detail}`,
      error,
    );
  }
}

/**
 * Chooses a remote read result while preserving the distinction between a
 * successful empty result and a failed read. `undefined` is reserved for the
 * failure path; an empty array is a valid successful result and must win over
 * a stale local-cache value.
 */
export function selectRemoteResult<T>(remoteValue: T | undefined, fallback: () => T): T {
  return remoteValue === undefined ? fallback() : remoteValue;
}
