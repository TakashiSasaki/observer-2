import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import observationInterchangeSchema from '../../contracts/observer-observation-interchange/releases/2.0.0/schema.json' with { type: 'json' };
import {
  appendJsonPointer,
  diagnostic,
  type ContractDiagnostic,
  type ContractValidationResult,
} from './diagnostics.ts';
import {
  CONTRACT_VERSION,
  SCHEMA_ID,
  SCHEMA_URI,
  type Observation,
  type ObservationInterchangeBundle,
  type ObservationSet,
  type ObservationSetMembership,
} from './types.ts';
import {
  findNonJsonDiagnostic,
  validateMembershipSemantics,
  validateObservationInterchangeSemantics,
  validateObservationSemantics,
  validateObservationSetSemantics,
} from './semanticValidation.ts';

export type ContractResource = 'bundle' | 'observation' | 'observationSet' | 'membership';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const schema = observationInterchangeSchema as Record<string, unknown>;
const schemaProperties = schema.properties as Record<string, { const?: unknown }> | undefined;
if (schema.$id !== SCHEMA_URI || schemaProperties?.schemaVersion?.const !== CONTRACT_VERSION) {
  throw new Error('The bundled contract Schema identity does not match the contract type constants.');
}
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema, SCHEMA_URI);

const validators: Record<ContractResource, ValidateFunction> = {
  bundle: ajv.getSchema(SCHEMA_URI)!,
  observation: ajv.compile({ $ref: `${SCHEMA_URI}#/$defs/Observation` }),
  observationSet: ajv.compile({ $ref: `${SCHEMA_URI}#/$defs/ObservationSet` }),
  membership: ajv.compile({ $ref: `${SCHEMA_URI}#/$defs/ObservationSetMembership` }),
};

function codeForAjvError(error: ErrorObject): ContractDiagnostic['code'] {
  if (error.keyword === 'required') return 'STRUCTURE_MISSING_FIELD';
  if (error.keyword === 'additionalProperties') return 'STRUCTURE_UNKNOWN_FIELD';
  if (error.keyword === 'format') return 'STRUCTURE_INVALID_FORMAT';
  if (error.keyword === 'pattern') return 'STRUCTURE_INVALID_PATTERN';
  if (error.keyword === 'type') {
    if (error.params.type === 'number' || error.params.type === 'integer') return 'STRUCTURE_INVALID_NUMBER';
    if (error.params.type === 'array') return 'STRUCTURE_INVALID_ARRAY';
    return 'STRUCTURE_INVALID_TYPE';
  }
  if (error.keyword === 'const' && error.instancePath.endsWith('/schemaVersion')) {
    return 'SCHEMA_VERSION_UNSUPPORTED';
  }
  if (error.keyword === 'uniqueItems') return 'DUPLICATE_ID';
  return 'STRUCTURE_INVALID_VALUE';
}

function pointerForAjvError(error: ErrorObject): string {
  let pointer = error.instancePath;
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    pointer = appendJsonPointer(pointer, error.params.missingProperty);
  }
  if (error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string') {
    pointer = appendJsonPointer(pointer, error.params.additionalProperty);
  }
  if (error.keyword === 'uniqueItems' && Number.isInteger(error.params.j)) {
    pointer = appendJsonPointer(pointer, String(error.params.j));
    pointer = appendJsonPointer(pointer, 'id');
  }
  return pointer;
}

function messageForAjvError(error: ErrorObject, resource: ContractResource, value: unknown): string {
  if (error.keyword === 'const' && error.instancePath.endsWith('/schemaVersion')) {
    const prefix = resource === 'bundle' ? 'bundle.schemaVersion' : `${resource}.schemaVersion`;
    return `${prefix} must be 2.0.0`;
  }
  if (error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string') {
    const property = error.params.additionalProperty;
    const entityMatch = error.instancePath.match(/^\/(observations|observationSets)\/\d+$/);
    if (entityMatch) {
      return `${entityMatch[1] === 'observations' ? 'Observation' : 'ObservationSet'} has unsupported field ${property}`;
    }
    return `${error.instancePath || resource} has unsupported field ${property}`;
  }
  if (error.keyword === 'format' && error.params.format === 'date-time') {
    return `${error.instancePath || resource} must be an RFC 3339 date-time string`;
  }
  if (error.keyword === 'uniqueItems') {
    const collection = error.instancePath === '/observations'
      ? 'observations'
      : error.instancePath === '/observationSets'
        ? 'observationSets'
        : 'memberships';
    const records = isRecord(value) ? value[collection] : undefined;
    const duplicateIndex = Number.isInteger(error.params.j) ? error.params.j : -1;
    const duplicate = Array.isArray(records) ? records[duplicateIndex] : undefined;
    const duplicateId = isRecord(duplicate) && typeof duplicate.id === 'string' ? duplicate.id : 'unknown';
    return `bundle.${collection} contains duplicate id ${duplicateId}`;
  }
  return `${error.instancePath || resource} ${error.message ?? 'is invalid'}`;
}

function structuralDiagnostics(
  value: unknown,
  resource: ContractResource,
): ContractDiagnostic[] {
  const runtimeFinding = findNonJsonDiagnostic(value);
  if (runtimeFinding) return [runtimeFinding];

  const validate = validators[resource];
  const valid = validate(value);
  if (valid) return [];
  return (validate.errors ?? []).map((error) => diagnostic(
    codeForAjvError(error),
    'structural',
    pointerForAjvError(error),
    messageForAjvError(error, resource, value),
    error.keyword,
  ));
}

function result<T>(value: T, diagnostics: ContractDiagnostic[]): ContractValidationResult<T> {
  return diagnostics.length === 0
    ? { valid: true, value, diagnostics: [] }
    : { valid: false, diagnostics };
}

export function validateObservationInterchangeBundle(
  value: unknown,
): ContractValidationResult<ObservationInterchangeBundle> {
  const structural = structuralDiagnostics(value, 'bundle');
  if (structural.length > 0) return { valid: false, diagnostics: structural };
  const semantic = validateObservationInterchangeSemantics(value as ObservationInterchangeBundle);
  return result(value as ObservationInterchangeBundle, semantic);
}

export function validateObservation(value: unknown): ContractValidationResult<Observation> {
  const structural = structuralDiagnostics(value, 'observation');
  if (structural.length > 0) return { valid: false, diagnostics: structural };
  const semantic = validateObservationSemantics(value as Observation);
  return result(value as Observation, semantic);
}

export function validateObservationSet(value: unknown): ContractValidationResult<ObservationSet> {
  const structural = structuralDiagnostics(value, 'observationSet');
  if (structural.length > 0) return { valid: false, diagnostics: structural };
  const semantic = validateObservationSetSemantics(value as ObservationSet);
  return result(value as ObservationSet, semantic);
}

export function validateObservationSetMembership(
  value: unknown,
): ContractValidationResult<ObservationSetMembership> {
  const structural = structuralDiagnostics(value, 'membership');
  if (structural.length > 0) return { valid: false, diagnostics: structural };
  const semantic = validateMembershipSemantics(value as ObservationSetMembership);
  return result(value as ObservationSetMembership, semantic);
}

export function assertObservationInterchangeBundle(
  value: unknown,
): asserts value is ObservationInterchangeBundle {
  const validation = validateObservationInterchangeBundle(value);
  if (!validation.valid) {
    throw new Error(`Invalid v2 observation interchange bundle: ${validation.diagnostics[0].message}`);
  }
}

export function assertObservation(value: unknown): asserts value is Observation {
  const validation = validateObservation(value);
  if (!validation.valid) {
    throw new Error(`Invalid v2 Observation: ${validation.diagnostics[0].message}`);
  }
}

export function assertObservationSet(value: unknown): asserts value is ObservationSet {
  const validation = validateObservationSet(value);
  if (!validation.valid) {
    throw new Error(`Invalid v2 ObservationSet: ${validation.diagnostics[0].message}`);
  }
}

export function assertObservationSetMembership(value: unknown): asserts value is ObservationSetMembership {
  const validation = validateObservationSetMembership(value);
  if (!validation.valid) {
    throw new Error(`Invalid v2 ObservationSetMembership: ${validation.diagnostics[0].message}`);
  }
}

export { SCHEMA_ID, SCHEMA_URI };
export type { ContractDiagnostic, ContractValidationResult } from './diagnostics.ts';
