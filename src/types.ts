/**
 * Canonical types for the 2.0.0 observation model.
 *
 * `Observation`, `ObservationSet`, and `ObservationSetMembership` are three
 * independent source-of-truth entities.  `ObservationSetView` is deliberately
 * a read-time projection and must never be written as a Firestore document.
 */
export const CURRENT_SCHEMA_VERSION = '2.0.0' as const;

export const FIRESTORE_COLLECTIONS = {
  observations: 'observations',
  observationSets: 'observationSets',
  memberships: 'observationSetMemberships',
} as const;

export type VisibilityType = 'public' | 'authenticated' | 'shared' | 'private';

export type ObservationType = 'nfc' | 'qr' | 'object' | 'ocr' | 'manual';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
}

export interface DetectedObject {
  name: string;
  category: string;
  confidence: number;
  description?: string;
}

export interface ObservationMetadata {
  nfcTech?: string;
  serialNumber?: string;
  detectedObjects?: DetectedObject[];
  extractedText?: string;
  language?: string;
  textType?: string;
  keyEntities?: string[];
  [key: string]: unknown;
}

/** A separately stored observation. It never contains a parent set ID. */
export interface Observation {
  id: string;
  uid: string;
  observerName?: string;
  observerPhoto?: string;
  type: ObservationType;
  title: string;
  summary: string;
  rawContent: string;
  imageUrl?: string;
  imagePath?: string;
  location?: LocationData;
  visibility: VisibilityType;
  allowedEmails: string[];
  metadata: ObservationMetadata;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
  /** `null` means active. A non-null value is an irreversible client soft delete. */
  deletedAt: string | null;
}

/** A separately stored grouping entity. It never embeds observations or IDs. */
export interface ObservationSet {
  id: string;
  uid: string;
  observerName?: string;
  observerPhoto?: string;
  type: ObservationType;
  title: string;
  summary: string;
  rawContent: string;
  imageUrl?: string;
  imagePath?: string;
  location?: LocationData;
  visibility: VisibilityType;
  allowedEmails: string[];
  tags: string[];
  metadata: ObservationMetadata;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * The sole ownership relation between an observation set and an observation.
 * `id` is always `${observationSetId}__${observationId}`.
 */
export interface ObservationSetMembership {
  id: string;
  observationSetId: string;
  observationId: string;
  /** In 2.0.0 this must equal the owner of both endpoint entities. */
  uid: string;
  /** Ordering is a property of the relation, not of either endpoint. */
  position: number;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  createdAt: string;
}

/** A read-time projection for the UI; never persist `observations` or `memberships`. */
export interface ObservationSetView extends ObservationSet {
  observations: Observation[];
  memberships: ObservationSetMembership[];
}

/** The only local-cache representation. It mirrors the three canonical entities. */
export interface NormalizedObservationCache {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  observations: Record<string, Observation>;
  observationSets: Record<string, ObservationSet>;
  memberships: Record<string, ObservationSetMembership>;
}

export type ObservationDraft = Omit<
  Observation,
  'id' | 'schemaVersion' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  id?: string;
  createdAt?: string;
};

export type ObservationSetDraft = Omit<
  ObservationSet,
  'id' | 'schemaVersion' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  id?: string;
  createdAt?: string;
  observations: ObservationDraft[];
};

export interface ObserverUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  isAnonymous: boolean;
}
