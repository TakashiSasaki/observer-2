/**
 * The normalized cache is an offline convenience, not an authorization
 * source. Keep its lifetime short and bind every snapshot to the principal
 * that produced it before using it as a fallback.
 */
export const NORMALIZED_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export type NormalizedCacheSnapshotMetadata = {
  principalUid: string;
  storedAt: number;
};

export function isFreshNormalizedCacheSnapshot(
  metadata: unknown,
  principalUid: string,
  now = Date.now(),
  maxAgeMs = NORMALIZED_CACHE_MAX_AGE_MS,
): metadata is NormalizedCacheSnapshotMetadata {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const candidate = metadata as Partial<NormalizedCacheSnapshotMetadata>;
  if (candidate.principalUid !== principalUid || typeof candidate.storedAt !== 'number') return false;
  if (!Number.isSafeInteger(candidate.storedAt) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false;
  const age = now - candidate.storedAt;
  return age >= 0 && age <= maxAgeMs;
}
