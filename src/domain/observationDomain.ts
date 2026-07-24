import {
  CURRENT_SCHEMA_VERSION,
  type Observation,
  type ObservationSet,
  type ObservationSetMembership,
  type ObservationSetView,
  type VisibilityType,
} from '../types.ts';

const observationTypes = new Set(['nfc', 'qr', 'object', 'ocr', 'manual']);
const visibilityTypes = new Set<VisibilityType>(['public', 'authenticated', 'shared', 'private']);
const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Entity = Observation | ObservationSet;

function fail(message: string): never {
  throw new Error(`Invalid v2 observation data: ${message}`);
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`);
}

function assertDate(value: unknown, name: string): asserts value is string {
  assertString(value, name);
  if (Number.isNaN(Date.parse(value))) fail(`${name} must be an ISO date-time string`);
}

function assertStringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(`${name} must be an array of strings`);
  }
}

function assertEntity(entity: Entity, kind: 'Observation' | 'ObservationSet'): void {
  assertString(entity.id, `${kind}.id`);
  if (!uuidV7Pattern.test(entity.id)) fail(`${kind}.id must be a lowercase UUIDv7`);
  assertString(entity.uid, `${kind}.uid`);
  assertString(entity.type, `${kind}.type`);
  if (!observationTypes.has(entity.type)) fail(`${kind}.type is unsupported`);
  assertString(entity.title, `${kind}.title`);
  if (typeof entity.summary !== 'string') fail(`${kind}.summary must be a string`);
  if (typeof entity.rawContent !== 'string') fail(`${kind}.rawContent must be a string`);
  if (!visibilityTypes.has(entity.visibility)) fail(`${kind}.visibility is unsupported`);
  assertStringArray(entity.allowedEmails, `${kind}.allowedEmails`);
  if (entity.visibility !== 'shared' && entity.allowedEmails.length !== 0) {
    fail(`${kind}.allowedEmails must be empty unless visibility is shared`);
  }
  if (entity.metadata === null || typeof entity.metadata !== 'object' || Array.isArray(entity.metadata)) {
    fail(`${kind}.metadata must be an object`);
  }
  if (entity.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail(`${kind}.schemaVersion must be ${CURRENT_SCHEMA_VERSION}`);
  }
  assertDate(entity.createdAt, `${kind}.createdAt`);
  assertDate(entity.updatedAt, `${kind}.updatedAt`);
  if (entity.deletedAt !== null) assertDate(entity.deletedAt, `${kind}.deletedAt`);
}

export function assertObservation(observation: Observation): void {
  assertEntity(observation, 'Observation');
}

export function assertObservationSet(observationSet: ObservationSet): void {
  assertEntity(observationSet, 'ObservationSet');
  assertStringArray(observationSet.tags, 'ObservationSet.tags');
}

/** Returns the only valid Firestore document ID for a membership tuple. */
export function membershipDocumentId(observationSetId: string, observationId: string): string {
  assertString(observationSetId, 'observationSetId');
  assertString(observationId, 'observationId');
  return `${observationSetId}__${observationId}`;
}

/**
 * Creates a membership while enforcing the v2 same-owner policy and the
 * deterministic tuple/document-ID invariant.
 */
export function createMembership(input: {
  observationSet: ObservationSet;
  observation: Observation;
  position: number;
  createdAt: string;
}): ObservationSetMembership {
  const { observationSet, observation, position, createdAt } = input;
  assertObservationSet(observationSet);
  assertObservation(observation);
  if (observationSet.deletedAt !== null || observation.deletedAt !== null) {
    fail('cannot attach a soft-deleted endpoint');
  }
  if (observationSet.uid !== observation.uid) {
    fail('cross-owner memberships are not supported in 2.0.0');
  }
  if (!Number.isInteger(position) || position < 0) {
    fail('membership position must be a non-negative integer');
  }
  assertDate(createdAt, 'membership.createdAt');

  return {
    id: membershipDocumentId(observationSet.id, observation.id),
    observationSetId: observationSet.id,
    observationId: observation.id,
    uid: observationSet.uid,
    position,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
  };
}

export function assertMembership(membership: ObservationSetMembership): void {
  assertString(membership.id, 'Membership.id');
  assertString(membership.observationSetId, 'Membership.observationSetId');
  assertString(membership.observationId, 'Membership.observationId');
  assertString(membership.uid, 'Membership.uid');
  if (membership.id !== membershipDocumentId(membership.observationSetId, membership.observationId)) {
    fail('Membership.id must be the deterministic tuple ID');
  }
  if (!Number.isInteger(membership.position) || membership.position < 0) {
    fail('Membership.position must be a non-negative integer');
  }
  if (membership.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail(`Membership.schemaVersion must be ${CURRENT_SCHEMA_VERSION}`);
  }
  assertDate(membership.createdAt, 'Membership.createdAt');
}

/**
 * Rebuilds UI data from the three canonical entity maps. It intentionally
 * ignores soft-deleted endpoints and never mutates the source entities.
 */
export function buildObservationSetViews(input: {
  observationSets: Iterable<ObservationSet>;
  observations: Iterable<Observation>;
  memberships: Iterable<ObservationSetMembership>;
}): ObservationSetView[] {
  const activeSets = new Map<string, ObservationSet>();
  for (const observationSet of input.observationSets) {
    assertObservationSet(observationSet);
    if (observationSet.deletedAt === null) activeSets.set(observationSet.id, observationSet);
  }

  const activeObservations = new Map<string, Observation>();
  for (const observation of input.observations) {
    assertObservation(observation);
    if (observation.deletedAt === null) activeObservations.set(observation.id, observation);
  }

  const membershipsBySet = new Map<string, ObservationSetMembership[]>();
  const tupleIds = new Set<string>();
  for (const membership of input.memberships) {
    assertMembership(membership);
    if (tupleIds.has(membership.id)) fail(`duplicate Membership.id: ${membership.id}`);
    tupleIds.add(membership.id);

    const observationSet = activeSets.get(membership.observationSetId);
    const observation = activeObservations.get(membership.observationId);
    if (!observationSet || !observation) continue;
    if (membership.uid !== observationSet.uid || membership.uid !== observation.uid) {
      fail(`Membership ${membership.id} does not share endpoint ownership`);
    }

    const current = membershipsBySet.get(membership.observationSetId) ?? [];
    current.push(membership);
    membershipsBySet.set(membership.observationSetId, current);
  }

  return [...activeSets.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .map((observationSet) => {
      const memberships = (membershipsBySet.get(observationSet.id) ?? [])
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
      return {
        ...observationSet,
        memberships,
        observations: memberships.map((membership) => activeObservations.get(membership.observationId)!),
      };
    });
}
