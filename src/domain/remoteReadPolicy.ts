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

export type RemoteReadFailureKind =
  | 'unavailable'
  | 'deadline-exceeded'
  | 'aborted'
  | 'cancelled'
  | 'permission-denied'
  | 'not-found'
  | 'unauthenticated'
  | 'failed-precondition'
  | 'resource-exhausted'
  | 'invalid-argument'
  | 'unknown';

const knownFailureKinds = new Set<RemoteReadFailureKind>([
  'unavailable',
  'deadline-exceeded',
  'aborted',
  'cancelled',
  'permission-denied',
  'not-found',
  'unauthenticated',
  'failed-precondition',
  'resource-exhausted',
  'invalid-argument',
  'unknown',
]);

const recoverableFailureKinds = new Set<RemoteReadFailureKind>([
  'unavailable',
  'deadline-exceeded',
  'aborted',
  'cancelled',
]);

function normalizedFailureCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return undefined;
  return code.replace(/^(?:firestore|auth)\//, '').toLowerCase();
}

function failureKind(error: unknown): RemoteReadFailureKind {
  const code = normalizedFailureCode(error);
  if (code && knownFailureKinds.has(code as RemoteReadFailureKind)) {
    return code as RemoteReadFailureKind;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/(network|fetch|offline|timeout|timed out)/.test(message)) return 'unavailable';
  return 'unknown';
}

/** A typed failure from a remote read, distinct from malformed remote data. */
export class RemoteReadError extends Error {
  readonly kind: RemoteReadFailureKind;
  readonly recoverable: boolean;
  readonly originalError: unknown;

  constructor(kind: RemoteReadFailureKind, originalError: unknown) {
    const detail = originalError instanceof Error ? originalError.message : 'unknown remote read failure';
    super(`Remote read failed (${kind}): ${detail}`);
    this.name = 'RemoteReadError';
    this.kind = kind;
    this.recoverable = recoverableFailureKinds.has(kind);
    this.originalError = originalError;
  }
}

export function isRemoteReadError(error: unknown): error is RemoteReadError {
  return error instanceof RemoteReadError;
}

/**
 * Converts provider-specific Firestore failures into the small policy surface
 * used by the repository. Unknown errors stay non-recoverable so programming
 * errors cannot be hidden by stale data.
 */
export function classifyRemoteReadError(error: unknown): RemoteReadError {
  if (isRemoteReadError(error)) return error;
  return new RemoteReadError(failureKind(error), error);
}

export function isRecoverableRemoteReadError(error: unknown): error is RemoteReadError {
  return isRemoteReadError(error) && error.recoverable;
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
