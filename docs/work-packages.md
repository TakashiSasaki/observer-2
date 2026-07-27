# WP00–WP07 status and remaining work

## 1. How to read this status

This is the current implementation ledger for the explicit many-to-many
observation program. The hash-locked files in `audit/m2m/` preserve the WP00 A8
baseline and deliberately still say that later packages were planned. They are
not a cumulative status database.

Status terms:

- **accepted** — implementation and required external evidence are complete;
- **implemented** — code and automated checks exist, but a stated acceptance
  activity remains;
- **partial** — a material part of the package remains to be built;
- **planned** — no accepted implementation yet.

One **iteration** in the estimate means one bounded change cycle:

1. implement and locally validate;
2. publish a draft PR from `chatgpt`;
3. pass GitHub Actions, including JDK 21 when applicable;
4. apply the patch in Google AI Studio;
5. verify the independently exported `main` tree.

## 2. Current package status

| WP | Scope | Status after this change | Evidence | Remaining acceptance |
|---|---|---|---|---|
| WP00 | Harness and external validation entry | **accepted** | A8 fixed registry, 36 harness tests, GitHub Actions baseline | Keep the frozen baseline interpretable |
| WP01 | v2 domain types and invariants | **implemented** | Canonical types, closed-field assertions, UUIDv7/time/location validation, domain tests | Final cumulative ledger closeout |
| WP02 | Membership operations, view rebuild, normalized cache | **implemented** | Deterministic memberships, attach/detach logic, projection, normalized cache, tests | Final cumulative ledger closeout |
| WP03 | Firestore repository, queries, indexes | **implemented** | Three collections, query-plan module, composite indexes, persistence tests | Production-project index deployment is operational work |
| WP04 | Security Rules and external Emulator tests | **implemented** | Rules enforce owner/shape/relation/time invariants; JDK 21 Actions passed | Preserve emulator pass for final release tree |
| WP05 | UI | **implemented** | Existing-observation picker, attach, membership-only detach, set ACL and soft delete, explicit composite-capture mode | Execute M01–M03 and verify multi-observation usability |
| WP06 | Interchange 2.0.0 and v1 policy | **implemented** | JSON Schema, semantic codec, deterministic round-trip, owner export/download, no-write import dry-run, owner-preserving conflict-safe import commit, receipt, size limits | Real-surface import acceptance and final cumulative ledger closeout |
| WP07 | Legacy removal and final validation | **partial** | v1 write/read removal, fresh-empty read policy, strict remote integrity error, typed read failures, cursor-paged scope-bound complete snapshots, principal-scoped five-minute cache, no-partial relation reads, visible UI error state, hardened Rules | Real-surface manual acceptance, final acceptance record |

The implementation evidence above does not mean the entire application roadmap
is complete. It evaluates the WP00–WP07 many-to-many data-model program only.

## 2.1 Separate contract distribution track: C01

C01 is a separate contract-distribution track and does not change the WP00–WP07
statuses, remaining acceptance activities, or effort estimates above. It moves
the existing structural interchange Schema into the `contracts/` registry,
records release `2.0.0` as the `observer-owner-scoped` profile, and assigns the
fixed UUIDv4 Schema ID
`2f1fd347-e99b-477e-884a-86a7dbb0358b` (`urn:uuid:` in JSON Schema `$id`).

C01 deliberately left semantic validation and deterministic canonicalization
in `src/domain/observationInterchange.ts`; it did not add `schemaId` to exchange
payloads, and does not implement a Schema resolver, external `$ref`, generated
public API artifacts, or Firestore import commit. The registry and release
manifest are checked by `npm run contracts:check`.

### C02 — reference validation and conformance evidence

C02 adds the first executable contract package without changing the accepted
2.0.0 payload or its immutable Schema and manifest:

- Ajv Draft 2020-12 validation with `ajv-formats` for the release Schema and
  each canonical resource definition;
- independent semantic validation for deterministic membership IDs, references,
  owner equality, `shared`/`allowedEmails`, timestamp ordering, and runtime JSON
  compatibility;
- stable diagnostic codes and RFC 6901 JSON Pointer locations;
- contract-owned types and canonicalization helpers, with the existing
  `src/domain/observationInterchange.ts` API retained as a compatibility
  wrapper;
- non-normative minimal examples and release conformance vectors executed by
  `npm run test:contracts`.

C02 does not implement Firestore import commit, a UUID Schema resolver, public
generated API artifacts, `/dev/contracts`, external `$ref`, or a generic
profile. The existing WP00–WP07 statuses and estimates remain unchanged.

### C03 — authorized owner-scoped import commit

C03 completes the persistence part of the exchange workflow without changing
the accepted 2.0.0 payload, Schema, manifest, registry, or release identity:

- imported `uid` values must equal the signed-in owner; no remapping exists;
- missing records are created by their existing canonical IDs;
- identical IDs with identical canonical records are idempotent no-ops;
- identical IDs with different canonical content reject the entire operation;
- new memberships require active owner-owned endpoints;
- all candidate reads and creations occur in one Firestore transaction, with a
  500-record total bound and a 9-new-membership Rules relation bound;
- the explicit UI commit returns a receipt with the raw input SHA-256, commit
  time, and created/skipped counts.

C03 adds no resolver, public contract endpoint, remapping layer, durable audit
collection, update/delete import behavior, or new contract release.

## 3. Completed requirement coverage

The following behaviors have automated coverage:

- independent canonical observations and sets;
- explicit unique memberships and relation-owned order;
- one observation in several sets;
- membership-only detach;
- non-cascading soft delete;
- read-time view reconstruction;
- independent endpoint ACL;
- normalized cache;
- query/index declarations;
- Security Rules endpoint and ownership validation;
- v2-only normalized interchange;
- deterministic serialization and round-trip;
- owner-scoped deterministic export and download;
- no-write import dry-run with structural/semantic errors, ownership, references,
  deletion counts, collision classification, and practical limits;
- owner-preserving import commit with identical-record idempotency, conflict
  rejection, inactive-endpoint rejection, atomic transaction bounds, and UI
  receipt counts;
- successful empty reads overriding stale cache;
- malformed remote data surfacing as `RemoteDataIntegrityError`.
- bounded-read snapshots record scope, principal, limit, result count, and
  completeness; cursor pagination and a next-page probe distinguish an
  exhausted exact-limit result from an incomplete prefix;
- owner-scoped `/dev` dummy-data creation and non-cascading cleanup, including
  the marker, active-state, and current-owner query boundary.

## 4. Remaining work, in recommended order

### Completed in the current change — documentation, UI, and no-write exchange

Deliver:

- repository entry documentation and coding-agent instructions;
- complete product and data-contract documents;
- explicit current versus future interface surfaces;
- restored `/dev` content without reintroducing the obsolete embedded model;
- current WP ledger and estimate;
- regression checks that documentation names the canonical collections and
  forbidden legacy model correctly.

This change also completed the safe, no-write part of the exchange workflow:

- an explicit UI mode places the first capture into a composite draft queue;
- the owner can export active canonical records from the remote-backed view;
- JSON download is deterministic and bounded;
- import file selection performs parse, semantic, ownership, reference, deletion,
  collision, and size checks without Firestore mutation;
- remote integrity failures clear the old list and are shown as a user-facing
  error state;
- the existing `TypesDocPage` raw-import regression is covered by a Vite type
  declaration.

### C03 — authorized, conflict-safe import commit (completed in this change)

The policy above is implemented in `src/domain/observationInterchange.ts` and
`src/services/firebaseService.ts`, with the explicit commit action in the app
exchange panel. The pure plan tests cover owner mismatch, ID-content conflict,
inactive endpoints, idempotent records, and both transaction bounds. The
Firestore Rules continue to enforce active owner-owned endpoints for new
memberships. C03 also allows authenticated missing-document probes for
Observation and ObservationSet candidates; existing-document ACL reads and
all write validation remain unchanged. The Emulator regression verifies that
an invalid relation rejects the whole transaction without partial writes.

Remaining acceptance is the real authenticated UI/Firestore flow and the
final cumulative ledger closeout.

### Iteration 4 — remote-read and cache hardening

Completed in the current change:

- typed distinction among transport/unavailable, permission, not-found, and
- integrity failures;
- fallback only for explicitly recoverable failures;
- prevent a failed or out-of-order filter change from leaving an unrelated
  previous view presented as current;
- principal-aware, five-minute cache handling and a documented stale-data
  policy;
- relation-query failures abort a projection, while independently inaccessible
  observation endpoints are redacted;
- bounded owner reads use cursor pages and a next-page probe; remote-required
  exchange reads reject a non-empty page beyond the 1,000-record bound;
- complete snapshots may be used at the exact configured limit only when the
  next-page probe confirms exhaustion;
- regression tests.

Remaining in this package:

- final acceptance on the real application surfaces.

### Iteration 5 — manual WP05 acceptance and `/test`

The current change implements a reproducible in-memory `/test` vertical slice
using the normalized cache and projection functions. It records the following
checks without connecting to Firestore:

- M01: attach one observation to sets A and B;
- M02: detach from A while the observation and B membership remain;
- M03: change/delete the set without changing observation content or ACL.

The remaining acceptance activity is to run the same checks against the real
authenticated UI and Firestore Emulator/application data:

Also cover anonymous versus non-anonymous sharing, offline fallback, empty
remote results, malformed remote data, and starting/saving a multi-observation
composite draft. Fix any usability or state-refresh defects found.

### Iteration 6 — final WP closeout

Deliver:

- reconcile the fixed WP00 audit protocol with a cumulative completion record
  without rewriting historical evidence;
- run the full Node, schema, harness, build, and JDK 21 Emulator suite on the
  final tree;
- verify required indexes and configuration;
- remove stale documentation and version labels;
- record accepted results and unresolved non-WP product roadmap items;
- verify the AI Studio `main` tree equals the accepted PR tree.

## 5. Effort estimate

The central estimate from the PR #13 baseline is:

- **6 iterations total after PR #13**;
- **2 further iterations after this change is applied by AI Studio**.

Reasonable range after this change: **1–4 further iterations**.

The lower bound assumes the import ownership/conflict policy is decided before
implementation and manual checks find no material defect. The upper bound
allows one split of the import commit work and one correction pass after
manual/Emulator validation.

This estimate excludes the broader Object/Marker/Place/fact-model roadmap,
production Cloud Storage migration, production deployment, and a complete
external API. Treating those as part of "all WPs" would require a new work
breakdown and a materially larger estimate.

## 6. Known issues outside immediate WP closure

- Cloud Storage upload and binary lifecycle are not implemented.
- Base64 image payload size is not guarded against the Firestore document-size
  limit.
- AI provider JSON responses lack a dedicated runtime response schema.
- `/admin` is reserved but absent.
- External APIs are not yet organized under a versioned `/api/vN` contract.
- Observation update and soft delete exist in the service but are not fully
  exposed in the UI.
- The owner-preserving import commit is bounded to one transaction; real
  authenticated UI/Firestore acceptance remains outstanding.
- Membership reordering has a Rules concept (`position`) but no current UI.
- The JSON Schema declares email format while runtime and Rules validation
  enforce only string/list semantics.
- The interchange codec enforces JSON-compatible metadata, while the general
  entity assertion and Rules currently enforce only object/map shape.
- `package-lock.json` is committed on the current `main`; use `npm ci
  --ignore-scripts` for reproducible local dependencies.
