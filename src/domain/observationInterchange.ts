import {
  CURRENT_SCHEMA_VERSION,
  type Observation,
  type ObservationSet,
  type ObservationSetMembership,
} from '../types.ts';
import {
  assertMembership,
  assertObservation,
  assertObservationSet,
  assertRfc3339DateTime,
} from './observationDomain.ts';

const bundleKeys = new Set([
  'schemaVersion', 'exportedAt', 'observations', 'observationSets', 'memberships',
]);

export type ObservationInterchangeBundle = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  exportedAt: string;
  observations: Observation[];
  observationSets: ObservationSet[];
  memberships: ObservationSetMembership[];
};

export type ObservationInterchangeExportInput = Omit<ObservationInterchangeBundle, 'schemaVersion'>;

function fail(message: string): never {
  throw new Error(`Invalid v2 observation interchange bundle: ${message}`);
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
}

function assertMetadataShape(metadata: Record<string, unknown>, name: string): void {
  const stringFields = ['nfcTech', 'serialNumber', 'extractedText', 'language', 'textType'];
  for (const field of stringFields) {
    if (field in metadata && typeof metadata[field] !== 'string') {
      fail(`${name}.${field} must be a string when present`);
    }
  }
  if ('keyEntities' in metadata) {
    if (!Array.isArray(metadata.keyEntities) || metadata.keyEntities.some((value) => typeof value !== 'string')) {
      fail(`${name}.keyEntities must be an array of strings when present`);
    }
  }
  if ('detectedObjects' in metadata) {
    if (!Array.isArray(metadata.detectedObjects)) fail(`${name}.detectedObjects must be an array when present`);
    for (const [index, detectedObject] of metadata.detectedObjects.entries()) {
      assertRecord(detectedObject, `${name}.detectedObjects[${index}]`);
      const allowedKeys = new Set(['name', 'category', 'confidence', 'description']);
      for (const key of Object.keys(detectedObject)) {
        if (!allowedKeys.has(key)) fail(`${name}.detectedObjects[${index}] has unsupported field ${key}`);
      }
      if (typeof detectedObject.name !== 'string' || typeof detectedObject.category !== 'string') {
        fail(`${name}.detectedObjects[${index}] must contain string name and category`);
      }
      if (typeof detectedObject.confidence !== 'number' || !Number.isFinite(detectedObject.confidence)) {
        fail(`${name}.detectedObjects[${index}].confidence must be a finite number`);
      }
      if ('description' in detectedObject && typeof detectedObject.description !== 'string') {
        fail(`${name}.detectedObjects[${index}].description must be a string when present`);
      }
    }
  }
}

function assertJsonCompatible(value: unknown, name: string, ancestors = new WeakSet<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${name} must not contain a non-finite number`);
    return;
  }
  if (typeof value !== 'object') fail(`${name} must contain only JSON values`);
  if (ancestors.has(value)) fail(`${name} must not contain a circular reference`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    fail(`${name} must not contain a non-plain object`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonCompatible(item, `${name}[${index}]`, ancestors));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertJsonCompatible(item, `${name}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function assertUniqueCanonicalRecords<T extends Observation | ObservationSet>(
  records: unknown[],
  name: string,
  assertion: (record: T) => void,
): Map<string, T> {
  const recordsById = new Map<string, T>();
  for (const [index, value] of records.entries()) {
    assertRecord(value, `${name}[${index}]`);
    const record = value as T;
    assertion(record);
    if (recordsById.has(record.id)) fail(`${name} contains duplicate id ${record.id}`);
    recordsById.set(record.id, record);
    const metadata = record.metadata;
    assertMetadataShape(metadata, `${name}[${index}].metadata`);
    assertJsonCompatible(metadata, `${name}[${index}].metadata`);
  }
  return recordsById;
}

function sortById<T extends { id: string }>(records: Iterable<T>): T[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function omitUndefinedFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Optional entity and location fields may be absent in TypeScript values but
 * cannot be represented as `undefined` in an interchange JSON document.
 */
function normalizeEntityForExchange<T extends Observation | ObservationSet>(entity: T): T {
  const normalized = omitUndefinedFields(entity as unknown as Record<string, unknown>) as T;
  if (normalized.location !== null && normalized.location !== undefined) {
    normalized.location = omitUndefinedFields(
      normalized.location as unknown as Record<string, unknown>,
    ) as unknown as T['location'];
  }
  return normalized;
}

/**
 * Performs both structural and cross-record semantic validation. Logical
 * deletions retain memberships, so a membership may reference a deleted
 * endpoint as long as both canonical endpoint records are present.
 */
export function assertObservationInterchangeBundle(value: unknown): asserts value is ObservationInterchangeBundle {
  assertRecord(value, 'bundle');
  for (const key of Object.keys(value)) {
    if (!bundleKeys.has(key)) fail(`bundle has unsupported field ${key}`);
  }

  const bundle = value as Partial<ObservationInterchangeBundle>;
  if (bundle.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail(`bundle.schemaVersion must be ${CURRENT_SCHEMA_VERSION}`);
  }
  assertRfc3339DateTime(bundle.exportedAt, 'bundle.exportedAt');
  assertArray(bundle.observations, 'bundle.observations');
  assertArray(bundle.observationSets, 'bundle.observationSets');
  assertArray(bundle.memberships, 'bundle.memberships');

  const observations = assertUniqueCanonicalRecords<Observation>(bundle.observations, 'bundle.observations', assertObservation);
  const observationSets = assertUniqueCanonicalRecords<ObservationSet>(bundle.observationSets, 'bundle.observationSets', assertObservationSet);
  const memberships = new Set<string>();
  for (const [index, value] of bundle.memberships.entries()) {
    assertRecord(value, `bundle.memberships[${index}]`);
    const membership = value as ObservationSetMembership;
    assertMembership(membership);
    if (memberships.has(membership.id)) fail(`bundle.memberships contains duplicate id ${membership.id}`);
    memberships.add(membership.id);

    const observationSet = observationSets.get(membership.observationSetId);
    const observation = observations.get(membership.observationId);
    if (!observationSet) fail(`Membership ${membership.id} references a missing ObservationSet`);
    if (!observation) fail(`Membership ${membership.id} references a missing Observation`);
    if (membership.uid !== observationSet.uid || membership.uid !== observation.uid) {
      fail(`Membership ${membership.id} must share the owner of both endpoints`);
    }
  }
}

/** Returns the canonical v2-only representation used for exchange and tests. */
export function canonicalizeObservationInterchangeBundle(value: unknown): ObservationInterchangeBundle {
  assertObservationInterchangeBundle(value);
  const canonical: ObservationInterchangeBundle = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: value.exportedAt,
    observations: sortById(value.observations).map(normalizeEntityForExchange),
    observationSets: sortById(value.observationSets).map(normalizeEntityForExchange),
    memberships: sortById(value.memberships),
  };
  assertObservationInterchangeBundle(canonical);
  return canonical;
}

/** Creates a validated v2 bundle; no v1 conversion or compatibility path exists. */
export function createObservationInterchangeBundle(input: ObservationInterchangeExportInput): ObservationInterchangeBundle {
  return canonicalizeObservationInterchangeBundle({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: input.exportedAt,
    observations: input.observations,
    observationSets: input.observationSets,
    memberships: input.memberships,
  });
}

function stableJsonValue(value: unknown): unknown {
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

/** Serializes a canonical bundle deterministically, including object key order. */
export function serializeObservationInterchangeBundle(value: unknown): string {
  return JSON.stringify(stableJsonValue(canonicalizeObservationInterchangeBundle(value)));
}

/** Parses and validates a JSON import. Only the v2 schema is accepted. */
export function parseObservationInterchangeBundle(serialized: string): ObservationInterchangeBundle {
  if (typeof serialized !== 'string') fail('serialized import must be a string');
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown parse error';
    fail(`serialized import is not valid JSON: ${message}`);
  }
  return canonicalizeObservationInterchangeBundle(parsed);
}
