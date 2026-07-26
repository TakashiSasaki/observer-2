/**
 * Application-facing type entry point. Contract-owned shapes are re-exported
 * from `src/contracts/types.ts`; projections, Firebase collection names, and
 * UI drafts remain application concerns here.
 */
import { CONTRACT_VERSION } from './contracts/types.ts';
import type {
  Observation,
  ObservationSet,
  ObservationSetMembership,
} from './contracts/types.ts';

export {
  CONTRACT_ID,
  CONTRACT_PROFILE,
  CONTRACT_VERSION,
  SCHEMA_ID,
  SCHEMA_URI,
} from './contracts/types.ts';
export type {
  DetectedObject,
  LocationData,
  Observation,
  ObservationInterchangeBundle,
  ObservationMetadata,
  ObservationSet,
  ObservationSetMembership,
  ObservationType,
  VisibilityType,
} from './contracts/types.ts';

export const CURRENT_SCHEMA_VERSION = CONTRACT_VERSION;

export const FIRESTORE_COLLECTIONS = {
  observations: 'observations',
  observationSets: 'observationSets',
  memberships: 'observationSetMemberships',
} as const;

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
