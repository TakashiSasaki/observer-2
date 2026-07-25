/**
 * Firestore document paths and their persisted `id` fields are the same
 * canonical identifier in v2. Reject a malformed document before it reaches
 * a domain converter, rather than silently replacing a mismatched stored ID.
 */
export function assertFirestoreDocumentIdentity(
  data: unknown,
  documentId: string,
  entityName: string,
): asserts data is Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${entityName} Firestore document must be an object`);
  }
  if ((data as Record<string, unknown>).id !== documentId) {
    throw new Error(`${entityName}.id must match its Firestore document ID`);
  }
}
