import {
  CURRENT_SCHEMA_VERSION,
  type NormalizedObservationCache,
  type Observation,
  type ObservationSet,
  type ObservationSetMembership,
  type ObservationSetView,
} from '../types.ts';
import {
  assertMembership,
  assertObservation,
  assertObservationSet,
  buildObservationSetViews,
  membershipDocumentId,
} from './observationDomain.ts';

const cacheKeys = new Set(['schemaVersion', 'observations', 'observationSets', 'memberships']);

type CacheMergeInput = {
  observations?: Iterable<Observation>;
  observationSets?: Iterable<ObservationSet | ObservationSetView>;
  memberships?: Iterable<ObservationSetMembership>;
};

function fail(message: string): never {
  throw new Error(`Invalid normalized observation cache: ${message}`);
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
}

function assertEntityMap<T extends { id: string }>(
  value: unknown,
  name: string,
  assertion: (entity: T) => void,
): void {
  assertRecord(value, name);
  for (const [key, entity] of Object.entries(value)) {
    assertRecord(entity, `${name}.${key}`);
    assertion(entity as T);
    if ((entity as T).id !== key) {
      fail(`${name} key ${key} must match the stored entity id`);
    }
  }
}

function canonicalObservationSet(observationSet: ObservationSet | ObservationSetView): ObservationSet {
  // Callers may provide a read-time view. Derived arrays are intentionally not
  // cacheable; all other fields must satisfy the canonical set contract.
  assertRecord(observationSet, 'ObservationSet');
  const candidate = observationSet as ObservationSet & Partial<ObservationSetView>;
  if ('observations' in candidate && !Array.isArray(candidate.observations)) {
    fail('ObservationSetView.observations must be an array when supplied to a cache merge');
  }
  if ('memberships' in candidate && !Array.isArray(candidate.memberships)) {
    fail('ObservationSetView.memberships must be an array when supplied to a cache merge');
  }
  const { observations: _observations, memberships: _memberships, ...canonical } = observationSet as ObservationSet & Partial<ObservationSetView>;
  assertObservationSet(canonical as ObservationSet);
  return canonical as ObservationSet;
}

function addEntities<T extends { id: string }>(
  target: Record<string, T>,
  entities: Iterable<T>,
  kind: string,
  assertion: (entity: T) => void,
): void {
  const seen = new Set<string>();
  for (const entity of entities) {
    assertRecord(entity, kind);
    assertion(entity);
    if (seen.has(entity.id)) fail(`duplicate ${kind}.id in one cache merge: ${entity.id}`);
    seen.add(entity.id);
    target[entity.id] = entity;
  }
}

/** Creates the only supported local-cache shape for schema version 2.0.0. */
export function emptyNormalizedObservationCache(): NormalizedObservationCache {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    observations: {},
    observationSets: {},
    memberships: {},
  };
}

/**
 * Validates a parsed cache before it is used. Cache map keys are part of the
 * invariant: every key must exactly equal the canonical entity's ID.
 */
export function assertNormalizedObservationCache(cache: unknown): asserts cache is NormalizedObservationCache {
  assertRecord(cache, 'cache');
  for (const key of Object.keys(cache)) {
    if (!cacheKeys.has(key)) fail(`cache has unsupported field ${key}`);
  }

  const candidate = cache as Partial<NormalizedObservationCache>;
  if (candidate.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail(`cache.schemaVersion must be ${CURRENT_SCHEMA_VERSION}`);
  }
  assertEntityMap(candidate.observations, 'cache.observations', assertObservation);
  assertEntityMap(candidate.observationSets, 'cache.observationSets', assertObservationSet);
  assertEntityMap(candidate.memberships, 'cache.memberships', assertMembership);
}

/**
 * Merges canonical entities into a validated cache without persisting a
 * projection. Repeated IDs in one input are rejected instead of silently
 * choosing an arbitrary source record.
 */
export function mergeNormalizedObservationCache(
  current: NormalizedObservationCache,
  input: CacheMergeInput,
): NormalizedObservationCache {
  assertNormalizedObservationCache(current);
  const next: NormalizedObservationCache = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    observations: { ...current.observations },
    observationSets: { ...current.observationSets },
    memberships: { ...current.memberships },
  };

  addEntities(next.observations, input.observations ?? [], 'Observation', assertObservation);

  const canonicalSets = Array.from(input.observationSets ?? [], canonicalObservationSet);
  addEntities(next.observationSets, canonicalSets, 'ObservationSet', assertObservationSet);

  addEntities(next.memberships, input.memberships ?? [], 'Membership', assertMembership);
  assertNormalizedObservationCache(next);
  return next;
}

/** Removes one relation and leaves both endpoint maps unchanged. */
export function detachMembershipFromNormalizedObservationCache(
  current: NormalizedObservationCache,
  observationSetId: string,
  observationId: string,
): NormalizedObservationCache {
  assertNormalizedObservationCache(current);
  const membershipId = membershipDocumentId(observationSetId, observationId);
  const memberships = { ...current.memberships };
  delete memberships[membershipId];
  return {
    ...current,
    memberships,
  };
}

/** Rebuilds the UI projection only from canonical normalized cache records. */
export function buildObservationSetViewsFromNormalizedObservationCache(
  cache: NormalizedObservationCache,
): ObservationSetView[] {
  assertNormalizedObservationCache(cache);
  return buildObservationSetViews({
    observations: Object.values(cache.observations),
    observationSets: Object.values(cache.observationSets),
    memberships: Object.values(cache.memberships),
  });
}
