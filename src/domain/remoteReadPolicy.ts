/**
 * Chooses a remote read result while preserving the distinction between a
 * successful empty result and a failed read. `undefined` is reserved for the
 * failure path; an empty array is a valid successful result and must win over
 * a stale local-cache value.
 */
export function selectRemoteResult<T>(remoteValue: T | undefined, fallback: () => T): T {
  return remoteValue === undefined ? fallback() : remoteValue;
}
