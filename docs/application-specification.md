# Observer application specification

## 1. Status and scope

This document describes the application implemented in
`TakashiSasaki/observer-2` as of schema version `2.0.0`. It is the product-level
specification: what the application does, which actors and surfaces exist, and
where current implementation ends.

Executable data rules remain authoritative in the files listed by `AGENTS.md`.
If this document and executable validation disagree, the disagreement is a
defect to fix; it is not permission to ignore either source.

Observer is a clean rebuild. The repository does not share Git history with
`TakashiSasaki/scan.moukaeritai.work`. That older repository provides historical
context only.

## 2. Product purpose

Observer records field observations from several capture methods and makes them
searchable, mappable, and shareable. A record can contain:

- manual notes;
- QR-code content;
- NFC tag information;
- OCR text extracted from an image;
- objects detected in an image;
- an optional image;
- an optional geographic position and display address;
- observer display information;
- visibility and sharing controls;
- type-specific JSON metadata.

The current vertical slice is centered on canonical observations and reusable
grouping:

1. The user authenticates, with anonymous authentication as the normal fallback.
2. The user captures an observation.
3. The application creates an `ObservationSet`, an independent `Observation`,
   and an explicit membership.
4. The user browses sets as a feed or map.
5. The owner may attach an existing owned observation to another owned set.
6. The owner may detach one membership without deleting the observation or its
   memberships in other sets.
7. Set and observation content remain independently shareable.

## 3. Core vocabulary

| Term | Meaning |
|---|---|
| `Observation` | One canonical captured result, stored independently |
| `ObservationSet` | One canonical grouping and feed entry, stored independently |
| `ObservationSetMembership` | The sole canonical relation between one set and one observation |
| `ObservationSetView` | A non-persistent read-time projection used by the UI |
| owner | The Firebase Auth principal whose UID equals an entity's `uid` |
| observer display snapshot | Optional `observerName` and `observerPhoto`; convenient display data, not identity or authority |
| soft delete | Setting `deletedAt`; the canonical document remains |
| detach | Physically deleting one membership only |

An `ObservationSet` has its own title, summary, type, location, image, ACL, and
metadata. Those values describe the grouping/feed entry; they are not copied
from a child as a canonical synchronization mechanism.

## 4. Actors and authorization expectations

| Actor | Authentication | Expected access |
|---|---|---|
| unauthenticated visitor | none | Public entities only |
| anonymous Firebase user | authenticated without a stable email | Public, authenticated, and owned anonymous-session entities; not email-shared entities |
| non-anonymous authenticated user | Firebase Auth, normally Google | Public, authenticated, explicitly email-shared, and owned entities |
| owner | authenticated UID equals `uid` | Read and permitted update operations on owned entities and relations |
| developer | repository and `/dev` access | Internal contract, diagnostics, and implementation status |
| administrator | future `/admin` surface | Audit and administrative workflows; not implemented yet |
| external integrator | future `/api` contract surface | Versioned machine contracts; only partial runtime endpoints exist today |

The owner UID is the authority. `observerName`, `observerPhoto`, email strings,
titles, and metadata never establish ownership.

## 5. Interface surfaces

The accepted interface-surface vocabulary is:

| Surface | Path | Status | Contract |
|---|---|---:|---|
| public | `/` | Implemented | Landing page and entry links |
| app | `/app` | Implemented | Authentication, creation, feed, map, filtering, sharing, attach, detach, and set soft delete |
| admin | `/admin` | Reserved | Administration, audit, and any legacy read-only browser/export tools |
| dev | `/dev` | Implemented | Internal developer documentation, data model, security, runtime, and WP status |
| api | `/api` | Partial | `/api/health`, `/api/analyze-object`, and `/api/analyze-ocr` are runtime endpoints; an external contract must use versioned subpaths such as `/api/v1/...` |
| test | `/test` | Reserved | Interactive vertical-slice and manual acceptance harness |

The surface vocabulary is independent of directory names and CLI command
layout. New pages must preserve the responsibility boundary. For example,
internal diagnostics belong under `/dev`, while contracts intended for other
applications belong under `/api`.

## 6. User workflows

### 6.1 Authentication

- The client listens to Firebase Auth state.
- If no user is signed in, it attempts anonymous sign-in.
- If Firebase anonymous sign-in fails, the UI creates a local guest identity so
  that local interaction can continue.
- Google sign-in is available from the authentication modal.
- Email-based `shared` visibility requires a non-anonymous authenticated token
  with a matching email.

The local guest fallback is not equivalent to a Firebase-authenticated owner.
Firestore writes are attempted only when `auth.currentUser` exists.

### 6.2 Create a set and observations

The creation modal supports `qr`, `nfc`, `object`, `ocr`, and `manual`
observations. In single-capture mode the normal UI save creates:

- one canonical `ObservationSet`;
- one canonical `Observation`;
- one membership.

The modal also has an explicit composite-set mode. In that mode the first
capture is placed into an in-memory draft queue rather than being saved
immediately; additional QR, NFC, OCR, object, or manual captures can be queued
and then saved as independent Observations with explicit Membership records.
The service accepts several observation drafts and can create one membership
for each in a single client batch. It limits a batch to nine memberships so
that Firestore Rules endpoint checks remain below access-call limits.

If no Firebase user is available, the canonical entities are still constructed
and placed in the normalized local cache, but no remote write occurs.

### 6.3 Browse and search

The application exposes four set feeds:

- `mine`
- `authenticated`
- `shared`
- `public`

Firestore query plans include the ACL-relevant predicate, `deletedAt == null`,
`createdAt desc`, and a bounded result count. Client search then filters the
loaded set views by text and observation type. A map view displays sets that
have location data.

Security Rules are not post-query filters. The client query must be capable of
returning only documents allowed by the selected feed.

### 6.4 Attach and detach

Only an authenticated owner can create a schema-2.0.0 membership:

- the set owner, observation owner, and membership `uid` must be the same;
- both endpoints must be active;
- the tuple must not already exist;
- the membership ID is deterministic.

The attachment picker is scoped to active observations owned by the current
principal and excludes observations already attached to the selected set.

Detach removes the membership document and local relation only. It does not
modify or delete either endpoint.

### 6.5 Update, visibility, and deletion

- The service can update mutable fields of an owned active observation.
- The current UI changes an owned set's visibility and allowed-email list.
- Observation ACL and set ACL are independent; changing a set never changes its
  observations.
- The current UI can soft-delete an owned set.
- The service can soft-delete an observation, but that operation is not yet
  exposed by the current UI.
- Soft-deleted entities cannot be updated again through the current Rules.
- Memberships are retained when an endpoint is soft-deleted. Read-time
  projection omits inactive endpoints and their resulting relations.

## 7. Capture, image, location, and AI behavior

### 7.1 Images

Browser-side image processing resizes an image to fit within 1024 × 768 pixels
and encodes it as WebP at quality 0.85. The resulting data URL can be stored in
`imageUrl`.

`imageUrl` is a representation string, not a storage lifecycle contract. The
model also reserves `imagePath` for a bucket object path, but Cloud Storage
upload, authorization, cleanup, and URL refresh are not implemented.

Firestore documents have a finite size limit, and Base64 increases payload
size. Large-image safety must not be inferred merely from the resize
dimensions. Moving binary data to Cloud Storage is remaining production work.

### 7.2 Location

The browser Geolocation API supplies latitude, longitude, and accuracy. The
client optionally calls OpenStreetMap Nominatim for a display address. Failure
to reverse-geocode does not invalidate numeric coordinates.

Contract validation requires:

- latitude from −90 through 90;
- longitude from −180 through 180;
- optional non-negative finite accuracy;
- optional string address;
- no unsupported location fields.

### 7.3 AI analysis

The Express server exposes:

- `POST /api/analyze-object`
- `POST /api/analyze-ocr`

Both accept an image and optional note and model selection. The server calls the
Gemini API with `GEMINI_API_KEY` and asks for JSON output. The API key must
remain server-side.

The current AI response parsing validates that the response is JSON but does
not yet apply a dedicated JSON Schema to the provider response before it
reaches the scanner UI. Provider output hardening remains outside the
observation schema WP00–WP07 program.

## 8. Runtime architecture

| Component | Responsibility |
|---|---|
| React/Vite client | UI, capture, local image conversion, domain construction, feed projection |
| Firebase Auth | anonymous and Google identity |
| Cloud Firestore | three canonical v2 collections and user profiles |
| browser `localStorage` | normalized fallback cache and selected AI model |
| Express server | static/Vite hosting, health route, Gemini proxy endpoints |
| Gemini API | object and OCR analysis |
| browser Geolocation | numeric position |
| Nominatim | best-effort reverse-geocoded address |

The client does not persist `ObservationSetView`. Firestore and the custom local
cache contain the same three normalized entity kinds, and the UI reconstructs
views after reading them.

## 9. Remote read and cache policy

The cache key is `observer-2.normalized-cache.v2`.

- A successful remote result is authoritative, including an empty array.
- A successful empty result must not resurrect stale cached records.
- A malformed Firestore document or invalid reconstructed view raises
  `RemoteDataIntegrityError`.
- A data-integrity error must reach the caller and must not trigger stale-cache
  fallback.
- Other read failures currently log a warning and may use normalized local
  cache data.

Current limitations:

- transport, permission, and availability failures are not yet classified into
  a narrow typed error policy;
- the cache has no TTL or complete-snapshot/reconciliation marker;
- attachment-picker failures and some partial reads still share a generic UI
  error path;
- per-set membership and per-observation read failures can produce a partial
  remote projection.

These limitations are tracked in `docs/work-packages.md`.

## 10. Data exchange

The repository contains a schema-2.0.0 interchange contract and pure codec. The
codec:

- accepts only the normalized three-array bundle;
- rejects unknown top-level and canonical entity fields;
- validates UUIDv7, timestamps, deterministic membership IDs, references,
  ownership, duplicates, and JSON-compatible metadata;
- sorts each entity array by ID;
- serializes object keys deterministically;
- round-trips canonical bundles.

The application now provides a bounded no-write exchange experience in `/app`:

- owner-scoped export of active canonical records;
- deterministic JSON download;
- import file selection and structural/semantic validation report;
- owner, reference, deletion, collision, and practical size previews;
- an explicit guarantee that the dry-run does not write to Firestore.

The application does not yet provide authorized Firestore import writes,
idempotency, or ownership remapping. Those policies must be decided together
with the persistence importer.

See `docs/data-contract-2.0.0.md` and `docs/work-packages.md`.

## 11. Version and legacy policy

The v2 cutover decision states that the current dataset is empty. Therefore:

- no v1 migration is implemented;
- no v1 read compatibility is implemented;
- no v1 import compatibility is implemented;
- no dual-write or backfill is implemented;
- legacy fields and collections are rejected rather than normalized.

Schema version `2.0.0` is exact. Open-ended type-specific additions belong in
JSON-compatible `metadata` when appropriate. A change to canonical top-level
shape requires an explicitly designed new version and compatibility policy.

## 12. Broader product roadmap boundary

The historical product direction includes physical `Objects`, identifying
`Markers`, `Places`, measurements, and append-only association facts. Those
concepts are not silently implied by the current `Observation` model.

They require a separate contract-first program covering identity,
canonicalization, ownership, event/fact semantics, projections, idempotency,
routes, repositories, and exchange. A coding agent must not add those concepts
as ad hoc fields to observation schema 2.0.0.

## 13. Current non-goals

- automatic legacy migration;
- v1 compatibility;
- cross-owner memberships;
- hard deletion of canonical observation entities;
- persisted set views or embedded canonical children;
- production-ready binary storage;
- a complete external versioned API;
- production-ready import writes;
- implemented `/admin` and `/test` surfaces;
- completing the later Object/Marker domain inside schema 2.0.0.
