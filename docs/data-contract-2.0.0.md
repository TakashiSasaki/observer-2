# Observer data contract 2.0.0

## 1. Contract status

`2.0.0` is the only accepted observation persistence and interchange schema.
The contract is closed-world at the canonical entity level: unknown top-level
fields are rejected. Type-specific extensions can be represented inside
JSON-compatible `metadata`.

Normative implementation sources:

| Layer | Source |
|---|---|
| TypeScript shapes and collection names | `src/types.ts` |
| Runtime entity and relation invariants | `src/domain/observationDomain.ts` |
| Firestore path/field conversion | `src/services/firebaseService.ts` |
| Firestore authorization and write constraints | `firestore.rules` |
| Firestore indexes | `firestore.indexes.json` |
| Structural exchange schema | `schemas/observation-interchange.schema.json` |
| Semantic exchange validation and canonical serialization | `src/domain/observationInterchange.ts` |
| Persistence summary | `firebase-blueprint.json` |

All affected layers and tests must change together when the contract changes.

## 2. Canonical model

```text
ObservationSet 1 ── 0..* ObservationSetMembership 0..* ── 1 Observation
```

Both endpoint kinds can have zero memberships. One observation can be related
to several sets. The same `(ObservationSet, Observation)` tuple can occur at
most once.

### 2.1 Common entity fields

`Observation` and `ObservationSet` share:

| Field | Type | Contract |
|---|---|---|
| `id` | string | lowercase UUIDv7; equals Firestore document ID |
| `uid` | non-empty string | owner Firebase Auth UID |
| `observerName` | string, null, or omitted in exchange | display snapshot only |
| `observerPhoto` | string, null, or omitted in exchange | display snapshot only |
| `type` | enum | `nfc`, `qr`, `object`, `ocr`, or `manual` |
| `title` | non-empty string | primary display title |
| `summary` | string | may be empty |
| `rawContent` | string | may be empty |
| `imageUrl` | string, null, or omitted in exchange | data URL or other representation URL |
| `imagePath` | string, null, or omitted in exchange | reserved storage object path |
| `location` | object, null, or omitted in exchange | validated coordinates and optional display fields |
| `visibility` | enum | `public`, `authenticated`, `shared`, or `private` |
| `allowedEmails` | unique string array | non-empty use is permitted only for `shared` |
| `metadata` | JSON object | open-ended JSON-compatible type-specific content |
| `schemaVersion` | literal | exactly `2.0.0` |
| `createdAt` | RFC 3339 / Firestore timestamp | immutable creation time |
| `updatedAt` | RFC 3339 / Firestore timestamp | not earlier than `createdAt`; monotonic on Firestore update |
| `deletedAt` | RFC 3339 / Firestore timestamp or null | null means active; otherwise not earlier than `createdAt` |

TypeScript values may omit optional display/image/location fields. The
Firestore converter materializes them as `null`, because Firestore Rules
require a closed and stable key set. Interchange JSON may omit those optional
keys or contain `null`, but it can never contain JavaScript `undefined`.

### 2.2 `Observation`

`Observation` adds no canonical top-level fields beyond the common entity
fields. It must not contain:

- `parentSetId`
- `observationIds`
- embedded `observations`
- `memberships`

### 2.3 `ObservationSet`

`ObservationSet` adds:

| Field | Type | Contract |
|---|---|---|
| `tags` | unique string array | set-level search/display tags |

It must not contain member IDs, embedded observations, or memberships.

### 2.4 `ObservationSetMembership`

| Field | Type | Contract |
|---|---|---|
| `id` | string | exactly `${observationSetId}__${observationId}` |
| `observationSetId` | UUIDv7 | existing canonical set endpoint |
| `observationId` | UUIDv7 | existing canonical observation endpoint |
| `uid` | non-empty string | equals both endpoint owners |
| `position` | non-negative integer | order within this set |
| `schemaVersion` | literal | exactly `2.0.0` |
| `createdAt` | RFC 3339 / Firestore timestamp | relation creation time |

Membership has no soft-delete field. Detach physically removes the membership.
Position ties are ordered by membership ID.

## 3. Projection

`ObservationSetView` is:

```ts
interface ObservationSetView extends ObservationSet {
  observations: Observation[];
  memberships: ObservationSetMembership[];
}
```

It is derived as follows:

1. Validate and index unique canonical endpoint IDs.
2. Exclude soft-deleted sets and observations.
3. Validate unique membership IDs.
4. Ignore memberships whose active endpoint is absent.
5. Reject a membership whose owner differs from either active endpoint.
6. Order memberships by `position`, then membership ID.
7. Map readable active observation endpoints in membership order.
8. Order sets by descending `createdAt`, then set ID.

Never send a view to a Firestore entity converter or interchange serializer as
a canonical set. The normalized cache strips the two derived arrays before
storing a set.

## 4. Firestore persistence

| Collection | Document ID | Canonical value |
|---|---|---|
| `/observations` | `Observation.id` | one observation |
| `/observationSets` | `ObservationSet.id` | one set |
| `/observationSetMemberships` | membership tuple ID | one relation |
| `/users` | user UID | observer profile support; not part of the interchange bundle |

`/singleObservations` is legacy and forbidden.

### 4.1 Create

Creating through the current UI constructs one set, its new observations, and
memberships in one batch. Rules require:

- authenticated owner;
- exact allowed key sets;
- valid IDs, types, location, visibility, metadata, schema, and timestamps;
- active new endpoints;
- active same-owner membership endpoints.

The client permits at most nine new memberships in one creation batch because
Rules use `getAfter()` for both endpoints of each membership.

### 4.2 Update

Immutable entity fields:

- `id`
- `uid`
- `schemaVersion`
- `createdAt`

Entity Rules permit only the declared mutable presentation, content, location,
ACL, metadata, `updatedAt`, and `deletedAt` fields. `updatedAt` cannot move
backward. Once `deletedAt` is non-null, later entity updates are rejected.

Membership update permits `position` only. Endpoint IDs, owner, schema, and
creation time remain immutable.

### 4.3 Delete

- Physical observation deletion: denied.
- Physical set deletion: denied.
- Observation soft delete: set `deletedAt` and `updatedAt`.
- Set soft delete: set `deletedAt` and `updatedAt`.
- Membership physical delete: permitted to its owner.

Endpoint soft deletion does not cascade. Retained memberships preserve relation
history, while active view projection omits the inactive endpoint.

## 5. Access control

### 5.1 Entity read matrix

| Visibility | Unauthenticated | Anonymous authenticated | Non-anonymous authenticated | Owner |
|---|---:|---:|---:|---:|
| `public` | yes | yes | yes | yes |
| `authenticated` | no | yes | yes | yes |
| `shared` | no | no | only matching token email | yes |
| `private` | no | no unless owner | no unless owner | yes |

Soft-deleted entities are not readable through normal entity Rules, including
by the owner.

### 5.2 Independent endpoint ACL

A set's ACL and an observation's ACL are separate:

- a readable set may permit reading its membership identifiers;
- each observation body is fetched separately;
- an observation body is returned only if its own ACL permits it;
- changing or deleting a set does not change observation ACL or content.

Membership read authorization is derived from the referenced set. This exposes
relation identifiers, not the observation body.

### 5.3 Query contract

Rules are not filters. Feed queries explicitly match their intended visibility
or owner scope and `deletedAt == null`. Required composite indexes are declared
in `firestore.indexes.json`.

The attachment picker is not based on feed visibility. It queries only active
observations owned by the signed-in principal.

## 6. ID, time, location, and metadata rules

### 6.1 UUIDv7

Observation and set IDs match:

```regex
^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

The client uses `uuid` v7 and lowercases the result. A converter rejects a
persisted `id` that differs from the Firestore path ID.

### 6.2 Time

Runtime and interchange timestamps are real RFC 3339 date-time strings.
Firestore stores them as native timestamps. Runtime validation rejects
impossible calendar values in addition to checking parseability.

The ordering rules are:

- `updatedAt >= createdAt`
- `deletedAt == null || deletedAt >= createdAt`
- Firestore update: new `updatedAt >=` stored `updatedAt`

### 6.3 Location

Allowed keys:

- `latitude`
- `longitude`
- `accuracy`
- `address`

Runtime and Rules enforce latitude/longitude bounds and non-negative accuracy.
The JSON Schema identifies numeric fields but semantic validation by the codec
is still required for bounds.

### 6.4 Metadata

Interchange metadata must be a JSON-compatible plain object:

- finite numbers only;
- no functions, symbols, BigInt, class instances, or circular references;
- known keys such as `detectedObjects` and `keyEntities` receive additional
  shape checks;
- unknown JSON-compatible metadata keys are allowed.

The general entity assertion and Firestore Rules currently require an
object/map but do not enforce every JSON-compatibility restriction above.
Firestore persistence must not be treated as proof that a metadata value can be
exported. The interchange codec performs the stricter check, and closing this
validation gap across persistence layers is remaining hardening work.

The exchange JSON Schema declares `allowedEmails` with `format: email`.
Runtime entity validation currently enforces unique strings and the visibility
relationship but does not implement a complete email-address parser. Consumers
requiring format enforcement must validate against the JSON Schema as well.
Narrowing this validation gap is tracked as remaining work.

## 7. Normalized local cache

The only supported custom cache has this shape:

```ts
interface NormalizedObservationCache {
  schemaVersion: '2.0.0';
  observations: Record<string, Observation>;
  observationSets: Record<string, ObservationSet>;
  memberships: Record<string, ObservationSetMembership>;
}
```

Every map key must equal its entity `id`. Unknown cache keys, legacy data, bad
entities, and duplicate records in one merge are rejected. A view supplied to a
cache merge is reduced to its canonical set fields.

Remote selection policy:

- `undefined` means the remote read failed and a fallback may be evaluated;
- `[]` means the remote read succeeded with no results and is authoritative;
- malformed remote data raises `RemoteDataIntegrityError`;
- an integrity error is rethrown and never replaced by cached data.
- provider read failures are classified. Only unavailable, deadline-exceeded,
  aborted, and cancelled failures are recoverable; permission, not-found,
  failed-precondition, quota, and unknown failures are not silently hidden.

The cache is principal-scoped and its metadata expires after five minutes. A
fallback snapshot is stored separately for each eligible scope:

- `mine-feed` — the owner set-feed query and its reconstructed relations;
- `attachment-picker` — the owner-only active-Observation query.

Each snapshot metadata record contains `principalUid`, `scope`, `storedAt`,
`resultLimit`, `resultCount`, and `complete`. A successful bounded read is
read in cursor pages of at most 100 documents. When the configured maximum is
reached, a next-page probe determines whether more matching records exist.
`complete` is true only when that probe is empty, so an exact-limit result can
be complete when the remote collection is exhausted. A fallback request may
use only a fresh complete snapshot for the same scope and principal whose
recorded limit is at least the requested limit. A remote-required exchange read
fails rather than exporting an incomplete bounded prefix.

Successful entity mutations invalidate both owner snapshot scopes. Shared,
authenticated, and public feeds do not use stale cache fallback because cached
ACLs are not an authorization source. Interchange export and import dry-run
require remote reads and therefore cannot silently operate on an incomplete
cache. The cache is not a full synchronized database or migration source.

## 8. Interchange bundle

The exact top-level shape is:

```json
{
  "schemaVersion": "2.0.0",
  "exportedAt": "2026-07-25T12:30:00.000Z",
  "observations": [],
  "observationSets": [],
  "memberships": []
}
```

No additional top-level properties are allowed.

### 8.1 Structural validation

`schemas/observation-interchange.schema.json` describes:

- exact top-level properties;
- entity required and optional fields;
- UUIDv7 and timestamp formats;
- enums;
- closed canonical entity shapes;
- metadata subshapes;
- unique array items.

JSON Schema alone cannot express every cross-record rule.

### 8.2 Semantic validation

The codec additionally checks:

- duplicate canonical IDs;
- exact deterministic membership ID;
- referenced endpoints exist in the bundle;
- membership and endpoint owners agree;
- timestamp and coordinate semantics;
- no legacy or unknown canonical fields;
- JSON-compatible metadata.

A membership may reference a soft-deleted endpoint if both canonical endpoint
records remain present in the bundle. This preserves the non-cascading
relationship history.

### 8.3 Canonicalization and serialization

- `observations`, `observationSets`, and `memberships` are sorted by ID.
- Optional JavaScript `undefined` fields are omitted.
- Object keys are recursively sorted for deterministic serialization.
- Serialization emits compact JSON without formatting whitespace.
- Parse → canonicalize → serialize is stable for a valid bundle.

This is deterministic JSON but is not currently specified as RFC 8785 JCS.
Do not claim JCS conformance without implementing and testing the RFC.

### 8.4 Delivery boundary

The application provides an owner-scoped export/download and a bounded import
dry-run. The dry-run parses and semantically validates a file, compares it with
the current owner's canonical records, reports counts/references/deletions,
classifies identical versus conflicting IDs, rejects foreign owners, and never
writes to Firestore. Owner-scoped source reads use cursor pages and reject a
non-empty page beyond the exchange bound. The current limits are 2,000,000
UTF-8 bytes and 1,000 total records across the three arrays.

A persistence importer still needs explicit decisions for:

- owner preservation or remapping;
- ID collision semantics;
- identical-record idempotency;
- conflicting-record rejection;
- partial versus atomic commit;
- maximum bundle size and batching;
- authorization;
- audit receipt;
- failure recovery.

## 9. Versioning policy

All validators currently require exact `2.0.0`.

- Documentation or validation bug fixes that do not change accepted canonical
  data can remain in 2.0.0.
- New JSON-compatible metadata keys can remain in 2.0.0.
- A top-level canonical field addition, removal, rename, meaning change, or
  relation-policy change requires a separately designed schema version.
- A new version must define persistence, exchange schema, codec, compatibility,
  migration/non-migration, tests, and cutover behavior together.
- Never silently accept both versions through aliases in the v2 converter.

## 10. Legacy rejection

The declared data count at cutover was zero. Version 2 therefore rejects rather
than converts:

- schema version 1 bundles;
- `parentSetId`;
- embedded observations;
- canonical `observationIds`;
- `/singleObservations`;
- v1 aliases;
- dual-write and backfill.
