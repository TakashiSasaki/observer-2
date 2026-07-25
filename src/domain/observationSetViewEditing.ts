import {
  type Observation,
  type ObservationSetMembership,
  type ObservationSetView,
} from '../types.ts';
import { buildObservationSetViews, membershipDocumentId } from './observationDomain.ts';

function rebuildView(
  view: ObservationSetView,
  observations: Observation[],
  memberships: ObservationSetMembership[],
): ObservationSetView {
  const { observations: _observations, memberships: _memberships, ...observationSet } = view;
  const [rebuilt] = buildObservationSetViews({
    observationSets: [observationSet],
    observations,
    memberships,
  });
  if (!rebuilt) throw new Error('Active ObservationSetView must remain available after a membership edit.');
  return rebuilt;
}

/** Returns the next append-only position for a new membership in this view. */
export function nextMembershipPosition(view: ObservationSetView): number {
  const highestPosition = view.memberships.reduce(
    (highest, membership) => Math.max(highest, membership.position),
    -1,
  );
  const next = highestPosition + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Membership position exceeds the JavaScript safe integer range.');
  return next;
}

/**
 * Applies one already-persisted membership to the read-time view. It never
 * creates a copied child inside the ObservationSet; the view is rebuilt from
 * the canonical Observation and Membership arrays.
 */
export function attachObservationToSetView(
  view: ObservationSetView,
  observation: Observation,
  membership: ObservationSetMembership,
): ObservationSetView {
  if (membership.observationSetId !== view.id) {
    throw new Error('Membership observationSetId must match the target ObservationSetView.');
  }
  if (membership.observationId !== observation.id) {
    throw new Error('Membership observationId must match the attached Observation.');
  }
  if (view.memberships.some((existing) => existing.id === membership.id)) {
    throw new Error('Observation is already attached to this ObservationSetView.');
  }
  if (view.observations.some((existing) => existing.id === observation.id)) {
    throw new Error('Observation is already projected in this ObservationSetView.');
  }

  return rebuildView(
    view,
    [...view.observations, observation],
    [...view.memberships, membership],
  );
}

/**
 * Removes only one Membership from a read-time view. The canonical
 * Observation itself remains in the caller's normalized cache and can stay
 * attached to other ObservationSets.
 */
export function detachObservationFromSetView(
  view: ObservationSetView,
  observationId: string,
): ObservationSetView {
  const membershipId = membershipDocumentId(view.id, observationId);
  if (!view.memberships.some((membership) => membership.id === membershipId)) {
    throw new Error('Observation is not attached to this ObservationSetView.');
  }

  return rebuildView(
    view,
    view.observations,
    view.memberships.filter((membership) => membership.id !== membershipId),
  );
}

/**
 * Limits the attachment picker to active Observations owned by the same
 * principal and not already related to the target ObservationSet.
 */
export function unattachedOwnedObservationsForSet(
  view: ObservationSetView,
  ownerUid: string,
  observations: Iterable<Observation>,
): Observation[] {
  if (view.uid !== ownerUid) return [];
  const attachedIds = new Set(view.memberships.map((membership) => membership.observationId));
  return [...observations]
    .filter((observation) => (
      observation.uid === ownerUid
      && observation.deletedAt === null
      && !attachedIds.has(observation.id)
    ))
    .sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt)
      || left.id.localeCompare(right.id)
    ));
}
