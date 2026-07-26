# Instructions for coding agents

## Required reading

Before changing application code, read all of:

1. `README.md`
2. `docs/application-specification.md`
3. `docs/data-contract-2.0.0.md`
4. `docs/work-packages.md`
5. `contracts/README.md`
6. The source-of-truth files for the area being changed, as listed below

Do not infer the current contract from the history of
`TakashiSasaki/scan.moukaeritai.work`. This repository is a clean rebuild and
does not share that Git history. Historical material may explain intent, but it
cannot override the contracts in this repository.

## Source-of-truth map

No prose document replaces executable validation. When two sources disagree,
stop and reconcile them in the same change rather than selecting the convenient
one.

| Concern | Authoritative files |
|---|---|
| Canonical TypeScript entities | `src/types.ts` |
| Entity and cross-record invariants | `src/domain/observationDomain.ts` |
| Normalized local cache | `src/domain/normalizedObservationCache.ts` |
| Cache principal/freshness policy | `src/domain/cachePolicy.ts` |
| Remote read failure policy | `src/domain/remoteReadPolicy.ts` |
| Interchange semantics and deterministic serialization | `src/domain/observationInterchange.ts` |
| Interchange contract registry and structural schema | `contracts/registry.json`, `contracts/observer-observation-interchange/releases/2.0.0/manifest.json`, `contracts/observer-observation-interchange/releases/2.0.0/schema.json` |
| Firestore conversion and operations | `src/services/firebaseService.ts` |
| Query shapes | `src/services/firestoreQueryPlan.ts` |
| Firestore authorization and write validation | `firestore.rules` |
| Required composite indexes | `firestore.indexes.json` |
| Persistence overview | `firebase-blueprint.json` |
| Executable acceptance evidence | `tests/` and `.github/workflows/m2m-baseline.yml` |
| Product behavior and interface surfaces | `docs/application-specification.md` |
| Current WP status | `docs/work-packages.md` |
| In-memory M01–M03 acceptance harness | `src/domain/observationAcceptanceHarness.ts`, `src/pages/TestPage.tsx` |

`audit/m2m/progress.json` and `audit/m2m/handoff.json` are the frozen WP00 A8
baseline required by the audit harness. They are not the current WP01–WP07
status ledger. See `audit/m2m/README.md`.

## Non-negotiable schema 2.0.0 invariants

1. `Observation`, `ObservationSet`, and `ObservationSetMembership` are
   independent canonical entities.
2. Never persist `ObservationSetView`, embedded `observations`, or a canonical
   `observationIds` array.
3. A membership ID is exactly
   `${observationSetId}__${observationId}` and is unique for that tuple.
4. A single observation may belong to multiple sets.
5. Schema 2.0.0 permits memberships only when both endpoints and the membership
   have the same `uid`.
6. `position` belongs only to the membership. Ties are resolved by membership
   document ID.
7. Detach physically deletes only the membership.
8. Observation and set deletion is logical through `deletedAt`; it does not
   cascade to the other endpoint.
9. Observation and set ACLs are independent. Readable set metadata does not
   grant access to an observation body.
10. IDs for observations and sets are lowercase UUIDv7 strings. Persisted
    `id` must match the Firestore document ID.
11. A successful empty remote read is authoritative and must not be replaced by
    stale cache data.
12. Malformed remote v2 data raises `RemoteDataIntegrityError`; it must not be
    hidden by cache fallback.
13. A cache fallback is allowed only for a fresh, principal-scoped owner (`mine`)
    snapshot after a classified transient read failure. It is never an
    authorization source for shared or public feeds.
14. A remote-required operation, including interchange export and import
    dry-run, must fail rather than use a possibly incomplete local cache.
15. A cache fallback snapshot must be bound to its feed scope and principal.
    Bounded reads use cursor pages and a next-page probe. A snapshot is
    complete only when the probe confirms that no more matching records exist;
    a maximum reached with another page is incomplete and cannot be used as
    fallback. Successful mutations invalidate such snapshots.

## Forbidden legacy behavior

Do not write or reintroduce:

- `/singleObservations`
- `parentSetId`
- embedded canonical `observations`
- canonical `observationIds`
- v1 aliases or fallback readers
- v1 import conversion
- cross-owner memberships
- hard deletion of `Observation` or `ObservationSet`

The declared v1 policy is `not-required-current-data-empty`. Changing that
decision requires explicit user approval and a separate migration design.

## Schema change policy

Validators reject unknown canonical fields. Therefore, adding, removing, or
renaming a top-level canonical field is not a transparent change to 2.0.0.

- Put open-ended, JSON-compatible type-specific data in `metadata` when that is
  semantically correct.
- For an incompatible canonical shape change, design a new version, schema,
  codec, persistence policy, and compatibility decision together.
- Keep TypeScript assertions, JSON Schema, Firestore Rules, blueprint,
  converters, developer documentation, and tests synchronized.
- Do not weaken one validation layer merely to make another layer pass.
- Treat a release artifact as immutable. A normative Schema change requires a
  new lowercase UUIDv4 Schema ID and a new release; do not rewrite an existing
  manifest or Schema in place.
- A Schema `$id` is the UUID URN recorded in its manifest. C01 does not provide
  a resolver from that identifier to a file or HTTP endpoint, and external
  `$ref` values are not permitted.

## Interface surfaces

Use the accepted vocabulary exactly:

- `/` — public
- `/app` — user application
- `/admin` — administration and audit
- `/dev` — internal developer information
- `/api` — external developer contract; machine APIs are versioned below it
- `/test` — interactive verification

The current implementation status is documented in
`docs/application-specification.md`. A reserved surface must remain visibly
reserved until it has an implementation and acceptance tests.

## Branch and pull-request workflow

- `main` is the branch exported by Google AI Studio.
- ChatGPT-authored changes are published through `chatgpt` and proposed to
  `main` as a draft pull request.
- Do not write directly to `main`.
- AI Studio applies the PR patch into its isolated workspace and exports a new,
  independently created commit to `main`; it does not Git-merge the PR.
- After AI Studio reports completion, compare the `main` and PR trees. Close
  the now-duplicate PR only after confirming equivalence.
- Before reusing `chatgpt`, close any still-open duplicate PR that uses it as
  the head branch, or the old PR will be rewritten.
- AI Studio has no JDK and no Git history. Prompts must be self-contained.
  Firestore Emulator execution belongs to GitHub Actions with JDK 21.
- Temporary patch files such as `pr12.diff` must not be committed.

## Change workflow

1. Resolve the latest GitHub `main` and verify any just-applied PR by tree, not
   by commit ID alone.
2. Work from that exact `main` tree in an isolated worktree.
3. Inspect the whole affected contract, including tests and documentation.
4. Keep the diff limited to the stated work package.
5. Add regression tests for changed behavior.
6. Run the required checks.
7. Review the final diff for legacy fields, contract drift, credentials, and
   unrelated generated artifacts.
8. Publish one intentional commit to `chatgpt` and open a draft PR.

## Required checks

For every application or documentation change:

```bash
npm run lint
npm run build
npm test
npm run verify:m2m:harness
git diff --check
```

When `firestore.rules`, Firestore converters, query plans, indexes, or
persistence behavior changes, also require the JDK 21 GitHub Actions
`firestore-emulator` job. A local environment without Java 21 must report that
test as unexecuted; it must not claim success by substitution.

The known baseline build warning is the Vite chunk-size warning. Do not classify
a new warning as baseline without comparing it to `main`. A production server
build must also pass an actual `npm start` health-check smoke test; a successful
esbuild exit code alone is insufficient.
