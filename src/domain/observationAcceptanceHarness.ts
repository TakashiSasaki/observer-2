import {
  assertNormalizedObservationCache,
  buildObservationSetViewsFromNormalizedObservationCache,
  detachMembershipFromNormalizedObservationCache,
  emptyNormalizedObservationCache,
  mergeNormalizedObservationCache,
} from './normalizedObservationCache.ts';
import { createMembership } from './observationDomain.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type NormalizedObservationCache,
  type Observation,
  type ObservationSet,
} from '../types.ts';

const createdAt = '2026-07-25T12:00:00.000Z';
const changedAt = '2026-07-25T12:01:00.000Z';
const ownerUid = 'acceptance-owner';
const observationId = '018fd116-8cf0-7def-8abc-1234567890ab';
const setAId = '018fd116-8cf0-7def-8abc-1234567890ac';
const setBId = '018fd116-8cf0-7def-8abc-1234567890ad';

export type AcceptanceCheck = {
  id: 'M01' | 'M02' | 'M03';
  title: string;
  passed: boolean;
  detail: string;
};

export type AcceptanceLogEntry = {
  step: string;
  operation: string;
  detail: string;
};

export type AcceptanceSnapshot = {
  activeSetIds: string[];
  activeObservationIds: string[];
  membershipIds: string[];
  projectedSetIds: string[];
  projectedObservationIdsBySet: Record<string, string[]>;
};

export type ObservationAcceptanceHarnessResult = {
  checks: AcceptanceCheck[];
  log: AcceptanceLogEntry[];
  snapshots: {
    initial: AcceptanceSnapshot;
    afterM01: AcceptanceSnapshot;
    afterM02: AcceptanceSnapshot;
    afterM03: AcceptanceSnapshot;
  };
};

function observation(): Observation {
  return {
    id: observationId,
    uid: ownerUid,
    observerName: 'Acceptance owner',
    type: 'manual',
    title: '受入れ用の観測',
    summary: 'M01〜M03の対象となる正本Observation',
    rawContent: 'in-memory acceptance fixture',
    visibility: 'private',
    allowedEmails: [],
    metadata: { harness: 'observation-v2-acceptance' },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

function observationSet(id: string, title: string): ObservationSet {
  return {
    id,
    uid: ownerUid,
    observerName: 'Acceptance owner',
    type: 'manual',
    title,
    summary: `${title}の正本ObservationSet`,
    rawContent: 'in-memory acceptance fixture',
    visibility: 'private',
    allowedEmails: [],
    tags: ['acceptance'],
    metadata: { harness: 'observation-v2-acceptance' },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

function snapshot(cache: NormalizedObservationCache): AcceptanceSnapshot {
  const views = buildObservationSetViewsFromNormalizedObservationCache(cache);
  return {
    activeSetIds: Object.values(cache.observationSets)
      .filter((set) => set.deletedAt === null)
      .map((set) => set.id)
      .sort(),
    activeObservationIds: Object.values(cache.observations)
      .filter((observation) => observation.deletedAt === null)
      .map((observation) => observation.id)
      .sort(),
    membershipIds: Object.keys(cache.memberships).sort(),
    projectedSetIds: views.map((view) => view.id).sort(),
    projectedObservationIdsBySet: Object.fromEntries(
      views.map((view) => [view.id, view.observations.map((item) => item.id)]),
    ),
  };
}

/**
 * Runs the WP05 M01–M03 acceptance path entirely in memory. It deliberately
 * uses the same normalized cache and projection functions as the application,
 * but never imports Firebase or writes to Firestore.
 */
export function runObservationAcceptanceHarness(): ObservationAcceptanceHarnessResult {
  const item = observation();
  const setA = observationSet(setAId, 'セットA');
  const setB = observationSet(setBId, 'セットB');
  let cache = mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
    observations: [item],
    observationSets: [setA, setB],
  });
  const log: AcceptanceLogEntry[] = [
    { step: 'initial', operation: 'create', detail: 'Observation 1件とObservationSet A/B 2件を作成' },
  ];
  const initial = snapshot(cache);

  const membershipA = createMembership({
    observationSet: setA,
    observation: item,
    position: 0,
    createdAt,
  });
  const membershipB = createMembership({
    observationSet: setB,
    observation: item,
    position: 0,
    createdAt,
  });
  cache = mergeNormalizedObservationCache(cache, { memberships: [membershipA, membershipB] });
  log.push({ step: 'M01', operation: 'attach', detail: '同じObservationをセットAとセットBへ所属させる' });
  const afterM01 = snapshot(cache);
  const m01Pass = afterM01.projectedObservationIdsBySet[setAId]?.includes(observationId) === true
    && afterM01.projectedObservationIdsBySet[setBId]?.includes(observationId) === true
    && afterM01.membershipIds.length === 2;

  cache = detachMembershipFromNormalizedObservationCache(cache, setAId, observationId);
  log.push({ step: 'M02', operation: 'detach', detail: 'セットAのMembershipだけを削除する' });
  const afterM02 = snapshot(cache);
  const m02Pass = !afterM02.membershipIds.includes(membershipA.id)
    && afterM02.membershipIds.includes(membershipB.id)
    && afterM02.activeObservationIds.includes(observationId)
    && afterM02.projectedObservationIdsBySet[setBId]?.includes(observationId) === true;

  const beforeObservation = JSON.stringify(cache.observations[observationId]);
  const changedSetB: ObservationSet = {
    ...cache.observationSets[setBId],
    visibility: 'public',
    updatedAt: changedAt,
  };
  const deletedSetA: ObservationSet = {
    ...cache.observationSets[setAId],
    deletedAt: changedAt,
    updatedAt: changedAt,
  };
  cache = {
    ...cache,
    observationSets: {
      ...cache.observationSets,
      [setAId]: deletedSetA,
      [setBId]: changedSetB,
    },
  };
  assertNormalizedObservationCache(cache);
  log.push({ step: 'M03', operation: 'update/delete', detail: 'セットBの公開範囲を変更し、セットAを論理削除する' });
  const afterM03 = snapshot(cache);
  const afterObservation = JSON.stringify(cache.observations[observationId]);
  const m03Pass = beforeObservation === afterObservation
    && afterM03.activeObservationIds.includes(observationId)
    && afterM03.membershipIds.includes(membershipB.id)
    && !afterM03.projectedSetIds.includes(setAId)
    && afterM03.projectedSetIds.includes(setBId);

  return {
    checks: [
      {
        id: 'M01',
        title: '一つのObservationをセットAとセットBへ所属させる',
        passed: m01Pass,
        detail: m01Pass ? '2つのMembershipと両Setの投影を確認しました。' : '両Setへの所属を確認できませんでした。',
      },
      {
        id: 'M02',
        title: 'セットAから外してもセットBとObservationを残す',
        passed: m02Pass,
        detail: m02Pass ? 'AのMembershipだけが消え、BとObservationは残りました。' : 'detachが他の正本へ波及しました。',
      },
      {
        id: 'M03',
        title: 'Set変更・論理削除がObservationへ連鎖しない',
        passed: m03Pass,
        detail: m03Pass ? 'Observation本体・ACL・BのMembershipを変更せず、Aだけを論理削除しました。' : 'Set変更がObservationまたは他Membershipへ波及しました。',
      },
    ],
    log,
    snapshots: { initial, afterM01, afterM02, afterM03 },
  };
}
