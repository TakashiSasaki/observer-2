import type { Observation, ObservationSet } from './types.ts';

export function sortById<T extends { id: string }>(records: Iterable<T>): T[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

export function omitUndefinedFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Optional entity and location fields may be absent in TypeScript values but
 * cannot be represented as `undefined` in an interchange JSON document.
 */
export function normalizeEntityForExchange<T extends Observation | ObservationSet>(entity: T): T {
  const normalized = omitUndefinedFields(entity as unknown as Record<string, unknown>) as T;
  if (normalized.location !== null && normalized.location !== undefined) {
    normalized.location = omitUndefinedFields(
      normalized.location as unknown as Record<string, unknown>,
    ) as unknown as T['location'];
  }
  return normalized;
}

export function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJsonValue((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
