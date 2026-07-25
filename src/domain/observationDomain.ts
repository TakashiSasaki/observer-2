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
const rfc3339DateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const commonEntityKeys = new Set([
  'id', 'uid', 'observerName', 'observerPhoto', 'type', 'title', 'summary', 'rawContent',
  'imageUrl', 'imagePath', 'location', 'visibility', 'allowedEmails', 'metadata',
  'schemaVersion', 'createdAt', 'updatedAt', 'deletedAt',
]);
const observationSetKeys = new Set([...commonEntityKeys, 'tags']);
const membershipKeys = new Set([
  'id', 'observationSetId', 'observationId', 'uid', 'position', 'schemaVersion', 'createdAt',
]);

type Entity = Observation | ObservationSet;

function fail(message: string): never {
  throw new Error(`Invalid v2 observation data: ${message}`);
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`);
}

function assertUuidV7(value: unknown, name: string): asserts value is string {
  assertString(value, name);
  if (!uuidV7Pattern.test(value)) fail(`${name} must be a lowercase UUIDv7`);
}

function assertDate(value: unknown, name: string): asserts value is string {
  assertString(value, name);
  const match = rfc3339DateTimePattern.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) {
    fail(`${name} must be an RFC 3339 date-time string`);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59) {
    fail(`${name} must name a real RFC 3339 date-time`);
  }
}

function assertUniqueStringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(`${name} must be an array of strings`);
  }
  if (new Set(value).size !== value.length) fail(`${name} must not contain duplicate values`);
}

function assertNullableString(value: unknown, name: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    fail(`${name} must be a string, null, or omitted`);
  }
}

function assertNullableLocation(value: unknown, name: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object, null, or omitted`);

  const location = value as Record<string, unknown>;
  const allowedKeys = new Set(['latitude', 'longitude', 'accuracy', 'address']);
  for (const key of Object.keys(location)) {
    if (!allowedKeys.has(key)) fail(`${name} has unsupported field ${key}`);
  }
  if (typeof location.latitude !== 'number' || !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) {
    fail(`${name}.latitude must be a finite number between -90 and 90`);
  }
  if (typeof location.longitude !== 'number' || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
    fail(`${name}.longitude must be a finite number between -180 and 180`);
  }
  if (location.accuracy !== undefined && (typeof location.accuracy !== 'number' || !Number.isFinite(location.accuracy) || location.accuracy < 0)) {
    fail(`${name}.accuracy must be a finite non-negative number when present`);
  }
  if (location.address !== undefined && typeof location.address !== 'string') {
    fail(`${name}.address must be a string when present`);
  }
}

function assertOnlySupportedEntityFields(entity: Entity, kind: 'Observation' | 'ObservationSet'): void {
  const allowedKeys = kind === 'Observation' ? commonEntityKeys : observationSetKeys;
  for (const key of Object.keys(entity as unknown as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) fail(`${kind} has unsupported field ${key}`);
  }
}

function assertEntity(entity: Entity, kind: 'Observation' | 'ObservationSet'): void {
  assertOnlySupportedEntityFields(entity, kind);
  assertUuidV7(entity.id, `${kind}.id`);
  assertString(entity.uid, `${kind}.uid`);
  assertString(entity.type, `${kind}.type`);
  if (!observationTypes.has(entity.type)) fail(`${kind}.type is unsupported`);
  assertString(entity.title, `${kind}.title`);
  if (typeof entity.summary !== 'string') fail(`${kind}.summary must be a string`);
  if (typeof entity.rawContent !== 'string') fail(`${kind}.rawContent must be a string`);
  assertNullableString(entity.observerName, `${kind}.observerName`);
  assertNullableString(entity.observerPhoto, `${kind}.observerPhoto`);
  assertNullableString(entity.imageUrl, `${kind}.imageUrl`);
  assertNullableString(entity.imagePath, `${kind}.imagePath`);
  assertNullableLocation(entity.location, `${kind}.location`);
  if (!visibilityTypes.has(entity.visibility)) fail(`${kind}.visibility is unsupported`);
  assertUniqueStringArray(entity.allowedEmails, `${kind}.allowedEmails`);
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
  if (Date.parse(entity.updatedAt) < Date.parse(entity.createdAt)) {
    fail(`${kind}.updatedAt must not be earlier than ${kind}.createdAt`);
  }
  if (entity.deletedAt !== null && Date.parse(entity.deletedAt) < Date.parse(entity.createdAt)) {
    fail(`${kind}.deletedAt must not be earlier than ${kind}.createdAt`);
  }
}

export function assertObservation(observation: Observation): void {
  assertEntity(observation, 'Observation');
}

export function assertObservationSet(observationSet: ObservationSet): void {
  assertEntity(observationSet, 'ObservationSet');
  assertUniqueStringArray(observationSet.tags, 'ObservationSet.tags');
}

/** Returns the only valid Firestore document ID for a membership tuple. */
export function membershipDocumentId(observationSetId: string, observationId: string): string {
  assertUuidV7(observationSetId, 'observationSetId');
  assertUuidV7(observationId, 'observationId');
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
  for (const key of Object.keys(membership as unknown as Record<string, unknown>)) {
    if (!membershipKeys.has(key)) fail(`Membership has unsupported field ${key}`);
  }
  assertString(membership.id, 'Membership.id');
  assertUuidV7(membership.observationSetId, 'Membership.observationSetId');
  assertUuidV7(membership.observationId, 'Membership.observationId');
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
  const observationSetIds = new Set<string>();
  for (const observationSet of input.observationSets) {
    assertObservationSet(observationSet);
    if (observationSetIds.has(observationSet.id)) fail(`duplicate ObservationSet.id: ${observationSet.id}`);
    observationSetIds.add(observationSet.id);
    if (observationSet.deletedAt === null) activeSets.set(observationSet.id, observationSet);
  }

  const activeObservations = new Map<string, Observation>();
  const observationIds = new Set<string>();
  for (const observation of input.observations) {
    assertObservation(observation);
    if (observationIds.has(observation.id)) fail(`duplicate Observation.id: ${observation.id}`);
    observationIds.add(observation.id);
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
