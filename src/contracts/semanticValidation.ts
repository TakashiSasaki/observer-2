import type {
  Observation,
  ObservationInterchangeBundle,
  ObservationSet,
  ObservationSetMembership,
} from './types.ts';
import {
  appendJsonPointer,
  diagnostic,
  type ContractDiagnostic,
} from './diagnostics.ts';

type EntityKind = 'Observation' | 'ObservationSet';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * JSON Schema validates parsed JSON. This additional walk protects the same
 * contract API when called with an in-memory TypeScript value before it is
 * serialized, including NaN, undefined, circular, and class instances.
 */
export function findNonJsonDiagnostic(value: unknown, instancePath = ''): ContractDiagnostic | null {
  const ancestors = new WeakSet<object>();

  const visit = (current: unknown, path: string): ContractDiagnostic | null => {
    if (current === undefined) {
      return diagnostic('NON_JSON_VALUE', 'semantic', path, `${path || 'value'} must not contain undefined`);
    }
    if (typeof current === 'number' && !Number.isFinite(current)) {
      return diagnostic(
        'NON_JSON_VALUE',
        'semantic',
        path,
        `${path || 'value'} must not contain a non-finite number`,
      );
    }
    if (current === null || typeof current === 'string' || typeof current === 'boolean' || typeof current === 'number') {
      return null;
    }
    if (typeof current !== 'object') {
      return diagnostic('NON_JSON_VALUE', 'semantic', path, `${path || 'value'} must contain only JSON values`);
    }
    if (!isPlainObject(current) && !Array.isArray(current)) {
      return diagnostic('NON_JSON_VALUE', 'semantic', path, `${path || 'value'} must not contain a non-plain object`);
    }
    if (ancestors.has(current)) {
      return diagnostic('NON_JSON_VALUE', 'semantic', path, `${path || 'value'} must not contain a circular reference`);
    }
    ancestors.add(current);
    if (Array.isArray(current)) {
      for (const [index, item] of current.entries()) {
        const finding = visit(item, appendJsonPointer(path, String(index)));
        if (finding) return finding;
      }
    } else {
      for (const [key, item] of Object.entries(current)) {
        const finding = visit(item, appendJsonPointer(path, key));
        if (finding) return finding;
      }
    }
    ancestors.delete(current);
    return null;
  };

  return visit(value, instancePath);
}

function entityLabel(kind: EntityKind, index?: number): string {
  if (index === undefined) return kind;
  return `bundle.${kind === 'Observation' ? 'observations' : 'observationSets'}[${index}]`;
}

function validateEntitySemantics(
  entity: Observation | ObservationSet,
  kind: EntityKind,
  instancePath: string,
  index?: number,
): ContractDiagnostic[] {
  const findings: ContractDiagnostic[] = [];
  const label = entityLabel(kind, index);

  if (entity.visibility !== 'shared' && entity.allowedEmails.length !== 0) {
    findings.push(diagnostic(
      'ACL_EMAILS_WITHOUT_SHARED_VISIBILITY',
      'semantic',
      appendJsonPointer(instancePath, 'allowedEmails'),
      `${label}.allowedEmails must be empty unless visibility is shared`,
    ));
  }

  if (entity.location) {
    if (entity.location.latitude < -90 || entity.location.latitude > 90) {
      findings.push(diagnostic(
        'LOCATION_INVALID_RANGE',
        'semantic',
        appendJsonPointer(appendJsonPointer(instancePath, 'location'), 'latitude'),
        `${label}.location.latitude must be between -90 and 90`,
      ));
    }
    if (entity.location.longitude < -180 || entity.location.longitude > 180) {
      findings.push(diagnostic(
        'LOCATION_INVALID_RANGE',
        'semantic',
        appendJsonPointer(appendJsonPointer(instancePath, 'location'), 'longitude'),
        `${label}.location.longitude must be between -180 and 180`,
      ));
    }
    if (entity.location.accuracy !== undefined && entity.location.accuracy < 0) {
      findings.push(diagnostic(
        'LOCATION_INVALID_RANGE',
        'semantic',
        appendJsonPointer(appendJsonPointer(instancePath, 'location'), 'accuracy'),
        `${label}.location.accuracy must be non-negative`,
      ));
    }
  }

  if (Date.parse(entity.updatedAt) < Date.parse(entity.createdAt)) {
    findings.push(diagnostic(
      'TEMPORAL_ORDER_INVALID',
      'semantic',
      appendJsonPointer(instancePath, 'updatedAt'),
      `${label}.updatedAt must not be earlier than ${label}.createdAt`,
    ));
  }
  if (entity.deletedAt !== null && Date.parse(entity.deletedAt) < Date.parse(entity.createdAt)) {
    findings.push(diagnostic(
      'TEMPORAL_ORDER_INVALID',
      'semantic',
      appendJsonPointer(instancePath, 'deletedAt'),
      `${label}.deletedAt must not be earlier than ${label}.createdAt`,
    ));
  }

  return findings;
}

function validateMembershipIdSemantics(
  membership: ObservationSetMembership,
  instancePath: string,
): ContractDiagnostic[] {
  const expectedId = `${membership.observationSetId}__${membership.observationId}`;
  if (membership.id !== expectedId) {
    return [diagnostic(
      'MEMBERSHIP_ID_MISMATCH',
      'semantic',
      appendJsonPointer(instancePath, 'id'),
      'Membership.id must be the deterministic tuple ID',
    )];
  }
  return [];
}

function duplicateIdFindings<T extends { id: string }>(
  records: T[],
  collection: 'observations' | 'observationSets' | 'memberships',
): ContractDiagnostic[] {
  const seen = new Set<string>();
  const findings: ContractDiagnostic[] = [];
  for (const [index, record] of records.entries()) {
    if (seen.has(record.id)) {
      findings.push(diagnostic(
        'DUPLICATE_ID',
        'semantic',
        appendJsonPointer(appendJsonPointer('', collection), String(index)),
        `bundle.${collection} contains duplicate id ${record.id}`,
      ));
    }
    seen.add(record.id);
  }
  return findings;
}

/** Semantic checks for one canonical entity after its release Schema passes. */
export function validateObservationSemantics(value: Observation, instancePath = ''): ContractDiagnostic[] {
  return validateEntitySemantics(value, 'Observation', instancePath);
}

/** Semantic checks for one canonical set after its release Schema passes. */
export function validateObservationSetSemantics(value: ObservationSet, instancePath = ''): ContractDiagnostic[] {
  return validateEntitySemantics(value, 'ObservationSet', instancePath);
}

/** Semantic checks for one membership after its release Schema passes. */
export function validateMembershipSemantics(value: ObservationSetMembership, instancePath = ''): ContractDiagnostic[] {
  return validateMembershipIdSemantics(value, instancePath);
}

/**
 * Cross-record semantic checks for a structurally valid v2 bundle. The
 * release Schema deliberately cannot express these references and ownership
 * invariants.
 */
export function validateObservationInterchangeSemantics(
  value: ObservationInterchangeBundle,
): ContractDiagnostic[] {
  const findings: ContractDiagnostic[] = [];
  const runtimeFinding = findNonJsonDiagnostic(value);
  if (runtimeFinding) findings.push(runtimeFinding);

  findings.push(...duplicateIdFindings(value.observations, 'observations'));
  findings.push(...duplicateIdFindings(value.observationSets, 'observationSets'));
  findings.push(...duplicateIdFindings(value.memberships, 'memberships'));

  value.observations.forEach((observation, index) => {
    findings.push(...validateEntitySemantics(observation, 'Observation', `/observations/${index}`, index));
  });
  value.observationSets.forEach((observationSet, index) => {
    findings.push(...validateEntitySemantics(observationSet, 'ObservationSet', `/observationSets/${index}`, index));
  });

  const observations = new Map(value.observations.map((observation) => [observation.id, observation]));
  const observationSets = new Map(value.observationSets.map((observationSet) => [observationSet.id, observationSet]));

  value.memberships.forEach((membership, index) => {
    const instancePath = `/memberships/${index}`;
    findings.push(...validateMembershipIdSemantics(membership, instancePath));
    const observationSet = observationSets.get(membership.observationSetId);
    const observation = observations.get(membership.observationId);
    if (!observationSet) {
      findings.push(diagnostic(
        'DANGLING_REFERENCE',
        'semantic',
        appendJsonPointer(instancePath, 'observationSetId'),
        `Membership ${membership.id} references a missing ObservationSet`,
      ));
    }
    if (!observation) {
      findings.push(diagnostic(
        'DANGLING_REFERENCE',
        'semantic',
        appendJsonPointer(instancePath, 'observationId'),
        `Membership ${membership.id} references a missing Observation`,
      ));
    }
    if (observationSet && observation && (membership.uid !== observationSet.uid || membership.uid !== observation.uid)) {
      findings.push(diagnostic(
        'OWNER_MISMATCH',
        'semantic',
        appendJsonPointer(instancePath, 'uid'),
        `Membership ${membership.id} must share the owner of both endpoints`,
      ));
    }
  });

  return findings;
}
