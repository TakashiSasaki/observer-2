import {
  CURRENT_SCHEMA_VERSION,
  type Observation,
  type ObservationSet,
  type ObservationSetMembership,
} from '../types.ts';
import type { ObservationInterchangeBundle as ContractObservationInterchangeBundle } from '../contracts/types.ts';
import {
  normalizeEntityForExchange,
  sortById,
  stableJsonValue,
} from '../contracts/canonicalize.ts';
import { validateObservationInterchangeBundle } from '../contracts/validator.ts';

export type ObservationInterchangeBundle = ContractObservationInterchangeBundle;

export type ObservationInterchangeExportInput = Omit<ObservationInterchangeBundle, 'schemaVersion'>;

/** Practical browser-side limits for the no-write import validation path. */
export const MAX_INTERCHANGE_FILE_BYTES = 2_000_000;
export const MAX_INTERCHANGE_RECORDS = 1_000;

/** Firestore transaction write limits for the authorized import path. */
export const MAX_INTERCHANGE_COMMIT_WRITES = 500;
/**
 * The current Security Rules validate each new membership through getAfter()
 * on both endpoints. Keep one import transaction within the same conservative
 * relation-write bound as the existing application batch path.
 */
export const MAX_INTERCHANGE_COMMIT_MEMBERSHIP_WRITES = 9;

export type ObservationInterchangeExistingRecords = {
  observations: Iterable<Observation>;
  observationSets: Iterable<ObservationSet>;
  memberships: Iterable<ObservationSetMembership>;
};

export type ObservationInterchangeImportDryRunReport = {
  valid: boolean;
  ownerUid: string;
  counts: {
    observations: number;
    observationSets: number;
    memberships: number;
    total: number;
  };
  deleted: {
    observations: number;
    observationSets: number;
    total: number;
  };
  references: {
    memberships: number;
    observationSets: number;
    observations: number;
    dangling: number;
  };
  ownership: {
    foreignRecords: number;
    foreignObservations: number;
    foreignObservationSets: number;
    foreignMemberships: number;
  };
  collisions: {
    identical: number;
    conflicting: number;
    total: number;
  };
  errors: string[];
};

export type ObservationInterchangeImportCommitReceipt = {
  ownerUid: string;
  bundleSha256: string;
  committedAt: string;
  counts: {
    observations: number;
    observationSets: number;
    memberships: number;
    total: number;
  };
  created: {
    observations: number;
    observationSets: number;
    memberships: number;
    total: number;
  };
  skippedIdentical: {
    observations: number;
    observationSets: number;
    memberships: number;
    total: number;
  };
};

export type ObservationInterchangeImportCommitErrorCode =
  | 'IMPORT_INVALID_BUNDLE'
  | 'IMPORT_OWNER_MISMATCH'
  | 'IMPORT_CONFLICT'
  | 'IMPORT_WRITE_LIMIT'
  | 'IMPORT_MEMBERSHIP_WRITE_LIMIT'
  | 'IMPORT_INACTIVE_ENDPOINT';

export class ObservationInterchangeImportCommitError extends Error {
  public readonly code: ObservationInterchangeImportCommitErrorCode;
  public readonly instancePath?: string;

  constructor(
    code: ObservationInterchangeImportCommitErrorCode,
    message: string,
    instancePath?: string,
  ) {
    super(message);
    this.name = 'ObservationInterchangeImportCommitError';
    this.code = code;
    this.instancePath = instancePath;
  }
}

function fail(message: string): never {
  throw new Error(`Invalid v2 observation interchange bundle: ${message}`);
}

/**
 * Performs both structural and cross-record semantic validation. Logical
 * deletions retain memberships, so a membership may reference a deleted
 * endpoint as long as both canonical endpoint records are present.
 */
export function assertObservationInterchangeBundle(value: unknown): asserts value is ObservationInterchangeBundle {
  const validation = validateObservationInterchangeBundle(value);
  if (!validation.valid) {
    fail(validation.diagnostics[0].message);
  }
}

/** Returns the canonical v2-only representation used for exchange and tests. */
export function canonicalizeObservationInterchangeBundle(value: unknown): ObservationInterchangeBundle {
  const normalizedInput = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? {
        ...(value as Record<string, unknown>),
        observations: Array.isArray((value as Record<string, unknown>).observations)
          ? ((value as Record<string, unknown>).observations as unknown[]).map((record) => (
              record !== null && typeof record === 'object' && !Array.isArray(record)
                ? normalizeEntityForExchange(record as Observation)
                : record
            ))
          : (value as Record<string, unknown>).observations,
        observationSets: Array.isArray((value as Record<string, unknown>).observationSets)
          ? ((value as Record<string, unknown>).observationSets as unknown[]).map((record) => (
              record !== null && typeof record === 'object' && !Array.isArray(record)
                ? normalizeEntityForExchange(record as ObservationSet)
                : record
            ))
          : (value as Record<string, unknown>).observationSets,
      }
    : value;
  assertObservationInterchangeBundle(normalizedInput);
  const canonical: ObservationInterchangeBundle = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: normalizedInput.exportedAt,
    observations: sortById(normalizedInput.observations),
    observationSets: sortById(normalizedInput.observationSets),
    memberships: sortById(normalizedInput.memberships),
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

/** Enforces the bounded, browser-safe scope of the no-write validation flow. */
export function assertObservationInterchangeBundleLimits(
  bundle: ObservationInterchangeBundle,
  serialized?: string,
): void {
  const totalRecords = bundle.observations.length + bundle.observationSets.length + bundle.memberships.length;
  if (totalRecords > MAX_INTERCHANGE_RECORDS) {
    fail(`bundle contains ${totalRecords} records; the maximum is ${MAX_INTERCHANGE_RECORDS}`);
  }
  if (serialized !== undefined) {
    const byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > MAX_INTERCHANGE_FILE_BYTES) {
      fail(`serialized bundle is ${byteLength} bytes; the maximum is ${MAX_INTERCHANGE_FILE_BYTES}`);
    }
  }
}

/** Serializes a canonical bundle deterministically, including object key order. */
export function serializeObservationInterchangeBundle(value: unknown): string {
  const canonical = canonicalizeObservationInterchangeBundle(value);
  const serialized = JSON.stringify(stableJsonValue(canonical));
  assertObservationInterchangeBundleLimits(canonical, serialized);
  return serialized;
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
  const canonical = canonicalizeObservationInterchangeBundle(parsed);
  assertObservationInterchangeBundleLimits(canonical, serialized);
  return canonical;
}

function recordMap<T extends { id: string }>(records: Iterable<T>): Map<string, T> {
  return new Map([...records].map((record) => [record.id, record]));
}

export function serializeObservationInterchangeRecord(
  record: Observation | ObservationSet | ObservationSetMembership,
): string {
  const normalized = 'position' in record
    ? record
    : normalizeEntityForExchange(record);
  return JSON.stringify(stableJsonValue(normalized));
}

function canonicalRecordJson(record: Observation | ObservationSet | ObservationSetMembership): string {
  return serializeObservationInterchangeRecord(record);
}

type ImportRecordKind = 'observations' | 'observationSets' | 'memberships';

export type ObservationInterchangeImportCommitPlan = {
  valid: boolean;
  errors: Array<{
    code: ObservationInterchangeImportCommitErrorCode;
    message: string;
    instancePath?: string;
  }>;
  created: {
    observations: Observation[];
    observationSets: ObservationSet[];
    memberships: ObservationSetMembership[];
  };
  skippedIdentical: {
    observations: number;
    observationSets: number;
    memberships: number;
    total: number;
  };
};

function emptyCommitPlanCounts(): ObservationInterchangeImportCommitPlan['skippedIdentical'] {
  return { observations: 0, observationSets: 0, memberships: 0, total: 0 };
}

function incrementCommitPlanCount(
  counts: ObservationInterchangeImportCommitPlan['skippedIdentical'],
  kind: ImportRecordKind,
): void {
  counts[kind] += 1;
  counts.total += 1;
}

/**
 * Builds the pure, conflict-safe part of an import commit. Persistence code
 * supplies the records read inside its transaction and applies only the
 * returned `created` records after this plan is valid.
 */
export function planObservationInterchangeImportCommit(
  bundle: ObservationInterchangeBundle,
  existing: ObservationInterchangeExistingRecords,
  ownerUid: string,
): ObservationInterchangeImportCommitPlan {
  assertObservationInterchangeBundle(bundle);
  assertObservationInterchangeBundleLimits(bundle);

  const errors: ObservationInterchangeImportCommitPlan['errors'] = [];
  const created = { observations: [], observationSets: [], memberships: [] } as ObservationInterchangeImportCommitPlan['created'];
  const skippedIdentical = emptyCommitPlanCounts();
  if (typeof ownerUid !== 'string' || ownerUid.length === 0) {
    errors.push({
      code: 'IMPORT_OWNER_MISMATCH',
      message: 'The signed-in owner UID must be a non-empty string.',
    });
  }

  const existingObservations = recordMap(existing.observations);
  const existingObservationSets = recordMap(existing.observationSets);
  const existingMemberships = recordMap(existing.memberships);

  const compare = <T extends Observation | ObservationSet | ObservationSetMembership>(
    kind: ImportRecordKind,
    records: T[],
    current: Map<string, T>,
    destination: T[],
  ) => {
    records.forEach((record, index) => {
      if (record.uid !== ownerUid) {
        errors.push({
          code: 'IMPORT_OWNER_MISMATCH',
          message: `bundle.${kind}[${index}].uid does not match the signed-in owner.`,
          instancePath: `/${kind}/${index}/uid`,
        });
        return;
      }
      const previous = current.get(record.id);
      if (!previous) {
        destination.push(record);
        return;
      }
      if (canonicalRecordJson(previous) === canonicalRecordJson(record)) {
        incrementCommitPlanCount(skippedIdentical, kind);
        return;
      }
      errors.push({
        code: 'IMPORT_CONFLICT',
        message: `bundle.${kind}[${index}] conflicts with existing record ${record.id}.`,
        instancePath: `/${kind}/${index}`,
      });
    });
  };

  compare('observations', bundle.observations, existingObservations, created.observations);
  compare('observationSets', bundle.observationSets, existingObservationSets, created.observationSets);
  compare('memberships', bundle.memberships, existingMemberships, created.memberships);

  if (bundle.observations.length + bundle.observationSets.length + bundle.memberships.length > MAX_INTERCHANGE_COMMIT_WRITES) {
    errors.push({
      code: 'IMPORT_WRITE_LIMIT',
      message: `The import contains more than ${MAX_INTERCHANGE_COMMIT_WRITES} records, the maximum for one atomic transaction.`,
    });
  }
  if (created.memberships.length > MAX_INTERCHANGE_COMMIT_MEMBERSHIP_WRITES) {
    errors.push({
      code: 'IMPORT_MEMBERSHIP_WRITE_LIMIT',
      message: `The import requires more than ${MAX_INTERCHANGE_COMMIT_MEMBERSHIP_WRITES} new membership writes in one Rules-safe transaction.`,
    });
  }

  const resolvedObservations = new Map([
    ...existingObservations,
    ...created.observations.map((record) => [record.id, record] as const),
  ]);
  const resolvedObservationSets = new Map([
    ...existingObservationSets,
    ...created.observationSets.map((record) => [record.id, record] as const),
  ]);
  created.memberships.forEach((membership, index) => {
    const observationSet = resolvedObservationSets.get(membership.observationSetId);
    const observation = resolvedObservations.get(membership.observationId);
    if (!observationSet || !observation || observationSet.deletedAt !== null || observation.deletedAt !== null) {
      errors.push({
        code: 'IMPORT_INACTIVE_ENDPOINT',
        message: `bundle.memberships[${index}] cannot be created because both endpoints must be active.`,
        instancePath: `/memberships/${index}`,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    created,
    skippedIdentical,
  };
}

function emptyDryRunReport(ownerUid: string, errors: string[] = []): ObservationInterchangeImportDryRunReport {
  return {
    valid: false,
    ownerUid,
    counts: { observations: 0, observationSets: 0, memberships: 0, total: 0 },
    deleted: { observations: 0, observationSets: 0, total: 0 },
    references: { memberships: 0, observationSets: 0, observations: 0, dangling: 0 },
    ownership: { foreignRecords: 0, foreignObservations: 0, foreignObservationSets: 0, foreignMemberships: 0 },
    collisions: { identical: 0, conflicting: 0, total: 0 },
    errors,
  };
}

/** Creates a report for a file that could not be parsed or validated. */
export function invalidObservationInterchangeImportDryRunReport(
  ownerUid: string,
  message: string,
): ObservationInterchangeImportDryRunReport {
  return emptyDryRunReport(ownerUid, [message]);
}

/**
 * Compares a validated import bundle with current canonical records without
 * mutating Firestore or the local cache. Identical ID collisions are safe to
 * replay; differing records and foreign owners remain blocking errors.
 */
export function analyzeObservationInterchangeImport(
  bundle: ObservationInterchangeBundle,
  existing: ObservationInterchangeExistingRecords,
  ownerUid: string,
): ObservationInterchangeImportDryRunReport {
  assertObservationInterchangeBundle(bundle);
  assertObservationInterchangeBundleLimits(bundle);
  const errors: string[] = [];
  if (typeof ownerUid !== 'string' || ownerUid.length === 0) {
    errors.push('The signed-in owner UID must be a non-empty string.');
  }

  const report: ObservationInterchangeImportDryRunReport = {
    valid: false,
    ownerUid,
    counts: {
      observations: bundle.observations.length,
      observationSets: bundle.observationSets.length,
      memberships: bundle.memberships.length,
      total: bundle.observations.length + bundle.observationSets.length + bundle.memberships.length,
    },
    deleted: {
      observations: bundle.observations.filter((record) => record.deletedAt !== null).length,
      observationSets: bundle.observationSets.filter((record) => record.deletedAt !== null).length,
      total: bundle.observations.filter((record) => record.deletedAt !== null).length
        + bundle.observationSets.filter((record) => record.deletedAt !== null).length,
    },
    references: {
      memberships: bundle.memberships.length,
      observationSets: new Set(bundle.memberships.map((membership) => membership.observationSetId)).size,
      observations: new Set(bundle.memberships.map((membership) => membership.observationId)).size,
      // The parser has already checked all references. Keep this field explicit
      // so the UI can distinguish a validated bundle from a future relaxed one.
      dangling: 0,
    },
    ownership: { foreignRecords: 0, foreignObservations: 0, foreignObservationSets: 0, foreignMemberships: 0 },
    collisions: { identical: 0, conflicting: 0, total: 0 },
    errors,
  };

  const existingObservations = recordMap(existing.observations);
  const existingObservationSets = recordMap(existing.observationSets);
  const existingMemberships = recordMap(existing.memberships);

  const compare = <T extends Observation | ObservationSet | ObservationSetMembership>(
    kind: string,
    records: T[],
    current: Map<string, T>,
    foreignCount: (value: number) => void,
  ) => {
    records.forEach((record, index) => {
      if (record.uid !== ownerUid) {
        foreignCount(1);
        errors.push(`bundle.${kind}[${index}].uid does not match the signed-in owner.`);
      }
      const previous = current.get(record.id);
      if (!previous) return;
      report.collisions.total += 1;
      if (canonicalRecordJson(previous) === canonicalRecordJson(record)) {
        report.collisions.identical += 1;
      } else {
        report.collisions.conflicting += 1;
        errors.push(`bundle.${kind}[${index}] conflicts with the existing record ${record.id}.`);
      }
    });
  };

  compare('observations', bundle.observations, existingObservations, (value) => {
    report.ownership.foreignRecords += value;
    report.ownership.foreignObservations += value;
  });
  compare('observationSets', bundle.observationSets, existingObservationSets, (value) => {
    report.ownership.foreignRecords += value;
    report.ownership.foreignObservationSets += value;
  });
  compare('memberships', bundle.memberships, existingMemberships, (value) => {
    report.ownership.foreignRecords += value;
    report.ownership.foreignMemberships += value;
  });

  report.valid = errors.length === 0;
  return report;
}
