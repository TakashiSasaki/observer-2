# Observer

Observer is a React, TypeScript, Firebase, and Express application for recording
multimodal field observations. A user can record manual notes, QR codes, NFC
tags, OCR results, and AI-assisted object observations with optional images and
locations, then group one canonical `Observation` into one or more
`ObservationSet` records.

The current persistence and interchange contract is **2.0.0**. It uses three
independent canonical entities:

- `Observation`
- `ObservationSet`
- `ObservationSetMembership`

`ObservationSetView` is a read-time projection. It is never a Firestore
document and must never be exported as a canonical entity.

## Start here

A coding agent that has not seen this repository before should read these files
in order:

1. [`AGENTS.md`](AGENTS.md) — repository rules, sources of truth, workflow, and
   non-negotiable invariants.
2. [`docs/application-specification.md`](docs/application-specification.md) —
   product behavior, actors, interface surfaces, and runtime boundaries.
3. [`docs/data-contract-2.0.0.md`](docs/data-contract-2.0.0.md) — canonical
   entities, Firestore persistence, ACL, cache, and interchange rules.
4. [`docs/work-packages.md`](docs/work-packages.md) — current WP00–WP07 status,
   remaining work, acceptance criteria, and effort estimate.
5. [`audit/m2m/README.md`](audit/m2m/README.md) — how to interpret the frozen
   WP00 audit registry.
6. [`contracts/README.md`](contracts/README.md) — versioned interchange
   contract artifacts and release identity rules.

The rendered internal developer summary is available at `/dev`.

## Interface surfaces

The project uses the following application-interface vocabulary. The vocabulary
is a product contract, not a required mirror of the source directory layout.

| Surface | Path | Current status | Responsibility |
|---|---|---:|---|
| public | `/` | Implemented | Product description and entry point |
| app | `/app` | Implemented | Normal user workflow |
| admin | `/admin` | Reserved | Administration, audit, and legacy read-only tools |
| dev | `/dev` | Implemented | Internal implementation documentation and status |
| api | `/api` | Partial | Runtime AI endpoints exist; external APIs must use versioned subpaths such as `/api/v1` |
| test | `/test` | Implemented | In-memory M01–M03 vertical-slice and acceptance-test surface; no Firestore writes |

Do not silently repurpose one surface for another responsibility.

## Local development

### Prerequisites

- Node.js 22
- npm
- Java 21 only when running the Firestore Emulator rules tests

The current `main` commits `package-lock.json`. Use the reproducible install
path used by CI:

```bash
npm ci --ignore-scripts
```

Create local configuration without committing credentials:

```bash
cp .env.example .env
cp firebase-applet-config.json.example firebase-applet-config.json
```

- `GEMINI_API_KEY` is read only by the Express server.
- `firebase-applet-config.json` configures Firebase Auth and Firestore.
- If the Firebase file is absent, the client loads a non-production demo
  configuration. That does not make a real Firebase backend available.

Run the development server:

```bash
npm run dev
```

The server listens on port 3000.

Build and run the production bundle:

```bash
npm run build
npm start
```

The start script passes an explicit production flag and serves `dist`; it does
not start Vite middleware.

## Validation

Run the checks that do not require Java:

```bash
npm run lint
npm run build
npm run contracts:check
npm test
npm run verify:m2m:harness
```

Run Firestore Security Rules tests with Java 21:

```bash
npm run test:firestore:emulator
```

GitHub Actions provisions Node.js 22 and Temurin JDK 21 and runs both validation
planes for pull requests targeting `main`.

The structural interchange Schema is maintained in the contract registry under
`contracts/observer-observation-interchange/releases/2.0.0/schema.json`.
`contracts/registry.json` and its release manifest identify it with the fixed
UUIDv4 Schema ID `2f1fd347-e99b-477e-884a-86a7dbb0358b`. The current semantic
validator and deterministic serialization remain in
`src/domain/observationInterchange.ts`.

## Important current boundaries

- Only schema version `2.0.0` is accepted.
- The current dataset was declared empty at the v2 cutover. No v1 migration,
  backward read compatibility, dual-write, or v1 import path exists.
- The app can export the owner's active canonical records and download a
  deterministic 2.0.0 JSON bundle. It also provides an import dry-run that
  validates structure, semantics, ownership, references, deletions, collisions,
  and practical size limits without writing to Firestore. Owner-scoped remote
  reads use cursor pages and reject an export source that exceeds the bounded
  1,000-record limit rather than exporting a partial bundle. The authorized
  Firestore import commit path is not yet implemented.
- The internal `/dev#tools` page can create a bounded dummy dataset for the
  current Firebase principal. It marks only its own records with
  `metadata.isDummyData`; cleanup soft-deletes those active endpoints and
  deliberately retains memberships as relation history.
- Entity deletion is a soft delete. Detaching an observation physically deletes
  only its membership.
- Image data is currently represented by `imageUrl`; the UI can place a WebP
  data URL there. Cloud Storage upload and lifecycle management are not yet
  implemented.
- `Objects`, `Markers`, `Places`, and append-only association facts belong to
  the broader product roadmap. They are not fields or collections in the
  current observation contract and must not be added to schema 2.0.0 without a
  separately approved contract.
