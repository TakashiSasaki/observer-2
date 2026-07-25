/**
 * The normalized cache is an offline convenience, not an authorization
 * source. Keep its lifetime short and bind every snapshot to the principal,
 * feed scope, and bounded-query completeness evidence before using it as a
 * fallback.
 */
export const NORMALIZED_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export type NormalizedCacheSnapshotScope = 'mine-feed' | 'attachment-picker';

export type NormalizedCacheSnapshotMetadata = {
  principalUid: string;
  scope: NormalizedCacheSnapshotScope;
  storedAt: number;
  resultLimit: number;
  resultCount: number;
  complete: boolean;
};

const snapshotScopes = new Set<NormalizedCacheSnapshotScope>(['mine-feed', 'attachment-picker']);

export function isFreshNormalizedCacheSnapshot(
  metadata: unknown,
  principalUid: string,
  scope: NormalizedCacheSnapshotScope,
  now = Date.now(),
  maxAgeMs = NORMALIZED_CACHE_MAX_AGE_MS,
): metadata is NormalizedCacheSnapshotMetadata {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const candidate = metadata as Partial<NormalizedCacheSnapshotMetadata>;
  if (candidate.principalUid !== principalUid || candidate.scope !== scope || !snapshotScopes.has(scope)) return false;
  if (typeof candidate.storedAt !== 'number' || !Number.isSafeInteger(candidate.storedAt)) return false;
  if (typeof candidate.resultLimit !== 'number' || !Number.isSafeInteger(candidate.resultLimit) || candidate.resultLimit <= 0) return false;
  if (typeof candidate.resultCount !== 'number' || !Number.isSafeInteger(candidate.resultCount) || candidate.resultCount < 0) return false;
  if (candidate.resultCount > candidate.resultLimit) return false;
  if (typeof candidate.complete !== 'boolean' || candidate.complete !== (candidate.resultCount < candidate.resultLimit)) return false;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false;
  const age = now - candidate.storedAt;
  return age >= 0 && age <= maxAgeMs;
}

export function isFreshCompleteNormalizedCacheSnapshot(
  metadata: unknown,
  principalUid: string,
  scope: NormalizedCacheSnapshotScope,
  minimumResultLimit: number,
  now = Date.now(),
  maxAgeMs = NORMALIZED_CACHE_MAX_AGE_MS,
): metadata is NormalizedCacheSnapshotMetadata {
  return Number.isSafeInteger(minimumResultLimit)
    && minimumResultLimit > 0
    && isFreshNormalizedCacheSnapshot(metadata, principalUid, scope, now, maxAgeMs)
    && metadata.complete
    && metadata.resultLimit >= minimumResultLimit;
}

export function createNormalizedCacheSnapshotMetadata(input: {
  principalUid: string;
  scope: NormalizedCacheSnapshotScope;
  resultLimit: number;
  resultCount: number;
  storedAt?: number;
}): NormalizedCacheSnapshotMetadata {
  const storedAt = input.storedAt ?? Date.now();
  return {
    principalUid: input.principalUid,
    scope: input.scope,
    storedAt,
    resultLimit: input.resultLimit,
    resultCount: input.resultCount,
    complete: input.resultCount < input.resultLimit,
  };
}
