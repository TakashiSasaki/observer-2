import { FIRESTORE_COLLECTIONS } from '../types.ts';

/** The four feeds exposed by the observation-set UI. */
export type ObservationSetFeedMode = 'mine' | 'shared' | 'authenticated' | 'public';

export type FirestoreQueryFilter = {
  fieldPath: string;
  op: '==' | 'array-contains';
  value: unknown;
};

export type FirestoreQueryOrder = {
  fieldPath: string;
  direction: 'asc' | 'desc';
};

/**
 * A database-independent representation of one Firestore query. Keeping the
 * filters and ordering here makes the composite-index contract testable
 * without contacting a Firebase project.
 */
export type FirestoreQueryPlan = {
  collection: string;
  filters: readonly FirestoreQueryFilter[];
  orderBy: readonly FirestoreQueryOrder[];
  limit?: number;
};

const createdAtDescendingOrder: readonly FirestoreQueryOrder[] = [
  { fieldPath: 'createdAt', direction: 'desc' },
];

/**
 * Returns the only permitted query shape for an observation-set feed. A
 * missing principal is intentionally represented by `null`, rather than an
 * unscoped query that could broaden a private or shared feed.
 */
export function observationSetFeedQueryPlan(
  mode: ObservationSetFeedMode,
  currentUserUid?: string,
  currentUserEmail?: string,
): FirestoreQueryPlan | null {
  const filters: FirestoreQueryFilter[] = [
    { fieldPath: 'deletedAt', op: '==', value: null },
  ];

  if (mode === 'mine') {
    if (!currentUserUid) return null;
    filters.unshift({ fieldPath: 'uid', op: '==', value: currentUserUid });
  } else if (mode === 'shared') {
    if (!currentUserEmail) return null;
    filters.unshift(
      { fieldPath: 'visibility', op: '==', value: 'shared' },
      { fieldPath: 'allowedEmails', op: 'array-contains', value: currentUserEmail },
    );
  } else {
    filters.unshift({ fieldPath: 'visibility', op: '==', value: mode });
  }

  return {
    collection: FIRESTORE_COLLECTIONS.observationSets,
    filters,
    orderBy: createdAtDescendingOrder,
    limit: 50,
  };
}

/**
 * Returns the bounded query used by an owner-only attachment picker. It is
 * deliberately scoped to the authenticated owner's active canonical
 * Observations; it is not a broad search over observations visible in a feed.
 */
export function ownedObservationPickerQueryPlan(
  ownerUid?: string,
): FirestoreQueryPlan | null {
  if (!ownerUid) return null;
  return {
    collection: FIRESTORE_COLLECTIONS.observations,
    filters: [
      { fieldPath: 'uid', op: '==', value: ownerUid },
      { fieldPath: 'deletedAt', op: '==', value: null },
    ],
    orderBy: createdAtDescendingOrder,
    limit: 100,
  };
}

/**
 * Returns the relation query used to reconstruct a set view. The `uid`
 * predicate is part of both the same-owner policy and the composite index.
 */
export function membershipProjectionQueryPlan(
  observationSetId: string,
  uid: string,
): FirestoreQueryPlan {
  return {
    collection: FIRESTORE_COLLECTIONS.memberships,
    filters: [
      { fieldPath: 'observationSetId', op: '==', value: observationSetId },
      { fieldPath: 'uid', op: '==', value: uid },
    ],
    orderBy: [
      { fieldPath: 'position', direction: 'asc' },
      { fieldPath: 'id', direction: 'asc' },
    ],
  };
}
