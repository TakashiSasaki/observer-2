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
| WP06 | Interchange 2.0.0 and v1 policy | **partial** | JSON Schema, semantic codec, deterministic round-trip, owner export/download, no-write import dry-run, collision/ownership report, size limits | Decide and implement authorized Firestore import commit path |
| WP07 | Legacy removal and final validation | **partial** | v1 write/read removal, fresh-empty read policy, strict remote integrity error, typed read failures, principal-scoped five-minute cache, no-partial relation reads, visible UI error state, hardened Rules | Complete-snapshot/reconciliation policy, manual acceptance, final acceptance record |

The implementation evidence above does not mean the entire application roadmap
is complete. It evaluates the WP00–WP07 many-to-many data-model program only.

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
- successful empty reads overriding stale cache;
- malformed remote data surfacing as `RemoteDataIntegrityError`.

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

### Iteration 3 — authorized, conflict-safe import commit

Decide and deliver:

- whether imported `uid` values must equal the signed-in user or are remapped;
- identical-ID identical-record idempotency;
- identical-ID different-record conflict rejection;
- all-or-nothing versus bounded-batch commit behavior;
- import receipt and recovery semantics.

Then implement the chosen policy in repository code, Rules where needed,
Emulator tests, and UI/API integration.

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
- regression tests.

Remaining in this package:

- complete-snapshot/reconciliation markers for bounded or paginated reads;
- a more specific attachment-picker error presentation;
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

- **5 iterations total after PR #13**;
- **4 further iterations after this change is applied by AI Studio**.

Reasonable range after this change: **3–6 further iterations**.

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
- Import commit policy and Firestore persistence are intentionally not yet
  implemented.
- Membership reordering has a Rules concept (`position`) but no current UI.
- The JSON Schema declares email format while runtime and Rules validation
  enforce only string/list semantics.
- The interchange codec enforces JSON-compatible metadata, while the general
  entity assertion and Rules currently enforce only object/map shape.
- `package-lock.json` is committed on the current `main`; use `npm ci
  --ignore-scripts` for reproducible local dependencies.
