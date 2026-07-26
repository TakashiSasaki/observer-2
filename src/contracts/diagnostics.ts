export type DiagnosticLayer = 'structural' | 'semantic';

export type ContractDiagnosticCode =
  | 'STRUCTURE_INVALID_TYPE'
  | 'STRUCTURE_MISSING_FIELD'
  | 'STRUCTURE_UNKNOWN_FIELD'
  | 'STRUCTURE_INVALID_VALUE'
  | 'STRUCTURE_INVALID_FORMAT'
  | 'STRUCTURE_INVALID_PATTERN'
  | 'STRUCTURE_INVALID_ARRAY'
  | 'STRUCTURE_INVALID_NUMBER'
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'DUPLICATE_ID'
  | 'DANGLING_REFERENCE'
  | 'MEMBERSHIP_ID_MISMATCH'
  | 'OWNER_MISMATCH'
  | 'ACL_EMAILS_WITHOUT_SHARED_VISIBILITY'
  | 'LOCATION_INVALID_RANGE'
  | 'TEMPORAL_ORDER_INVALID'
  | 'NON_JSON_VALUE';

/** A stable, machine-readable validation finding. */
export interface ContractDiagnostic {
  code: ContractDiagnosticCode;
  layer: DiagnosticLayer;
  /** RFC 6901 JSON Pointer. The empty string denotes the document root. */
  instancePath: string;
  message: string;
  keyword?: string;
}

export interface ContractValidationResult<T = unknown> {
  valid: boolean;
  value?: T;
  diagnostics: ContractDiagnostic[];
}

export function appendJsonPointer(pointer: string, token: string): string {
  const escaped = token.replaceAll('~', '~0').replaceAll('/', '~1');
  return `${pointer}/${escaped}`;
}

export function diagnostic(
  code: ContractDiagnosticCode,
  layer: DiagnosticLayer,
  instancePath: string,
  message: string,
  keyword?: string,
): ContractDiagnostic {
  return { code, layer, instancePath, message, ...(keyword ? { keyword } : {}) };
}
