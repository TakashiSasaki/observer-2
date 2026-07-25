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

| WP | Scope | Status after PR #12 | Evidence | Remaining acceptance |
|---|---|---|---|---|
| WP00 | Harness and external validation entry | **accepted** | A8 fixed registry, 36 harness tests, GitHub Actions baseline | Keep the frozen baseline interpretable |
| WP01 | v2 domain types and invariants | **implemented** | Canonical types, closed-field assertions, UUIDv7/time/location validation, domain tests | Final cumulative ledger closeout |
| WP02 | Membership operations, view rebuild, normalized cache | **implemented** | Deterministic memberships, attach/detach logic, projection, normalized cache, tests | Final cumulative ledger closeout |
| WP03 | Firestore repository, queries, indexes | **implemented** | Three collections, query-plan module, composite indexes, persistence tests | Production-project index deployment is operational work |
| WP04 | Security Rules and external Emulator tests | **implemented** | Rules enforce owner/shape/relation/time invariants; JDK 21 Actions passed | Preserve emulator pass for final release tree |
| WP05 | UI | **implemented** | Existing-observation picker, attach, membership-only detach, set ACL and soft delete | Execute M01–M03 and repair the unreachable first composite-draft transition |
| WP06 | Interchange 2.0.0 and v1 policy | **partial** | JSON Schema, semantic codec, deterministic round-trip, v1 rejection tests | User-facing export/import, dry-run report, conflict/ownership policy, Firestore import commit path |
| WP07 | Legacy removal and final validation | **partial** | v1 write/read removal, fresh-empty read policy, strict remote integrity error, hardened Rules | Documentation/dev page stride, typed recoverable-read policy, visible error state, cache security/reconciliation, final acceptance record |

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
- successful empty reads overriding stale cache;
- malformed remote data surfacing as `RemoteDataIntegrityError`.

## 4. Remaining work, in recommended order

### Iteration 1 — documentation and `/dev` completion

Deliver:

- repository entry documentation and coding-agent instructions;
- complete product and data-contract documents;
- explicit current versus future interface surfaces;
- restored `/dev` content without reintroducing the obsolete embedded model;
- current WP ledger and estimate;
- regression checks that documentation names the canonical collections and
  forbidden legacy model correctly.

This is the current change.

### Iteration 2 — export and import validation experience

Deliver:

- export the canonical records available to the owner as a 2.0.0 bundle;
- download deterministic JSON;
- select an import file;
- parse and validate without writing;
- show structural and semantic errors with record paths;
- preview counts, owners, references, deletions, and collisions;
- enforce practical file and record limits.

No Firestore mutation should occur in this iteration.

### Iteration 3 — authorized, conflict-safe import commit

First decide and document:

- whether imported `uid` values must equal the signed-in user or are remapped;
- identical-ID identical-record idempotency;
- identical-ID different-record conflict rejection;
- all-or-nothing versus bounded-batch commit behavior;
- import receipt and recovery semantics.

Then implement the chosen policy in repository code, Rules where needed,
Emulator tests, and UI/API integration.

### Iteration 4 — remote-read and cache hardening

Deliver:

- typed distinction among transport/unavailable, permission, not-found, and
  integrity failures;
- fallback only for explicitly recoverable failures;
- a dedicated user-visible integrity/error state;
- prevent a failed filter change from leaving an unrelated previous view
  presented as current;
- principal-aware cache handling and a documented stale-data policy;
- define behavior for partial membership/observation read failures;
- regression tests.

### Iteration 5 — manual WP05 acceptance and `/test`

Implement the reserved `/test` vertical slice or an equivalent reproducible
manual harness and record:

- M01: attach one observation to sets A and B;
- M02: detach from A while the observation and B membership remain;
- M03: change/delete the set without changing observation content or ACL.

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

The central estimate is:

- **6 iterations including the current documentation `/dev` change**
- **5 further iterations after this change is applied by AI Studio**

Reasonable range: **4–7 further iterations**.

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
- Composite creation has rendering and save logic, but no reachable transition
  places the first capture into the draft queue.
- Membership reordering has a Rules concept (`position`) but no current UI.
- The JSON Schema declares email format while runtime and Rules validation
  enforce only string/list semantics.
- The interchange codec enforces JSON-compatible metadata, while the general
  entity assertion and Rules currently enforce only object/map shape.
- The npm lockfile policy remains undecided; CI therefore uses
  `npm install --ignore-scripts`, not `npm ci`.
