# Observer contract registry

`contracts/` is the source-of-truth boundary for versioned interchange
contract artifacts. The first release recorded here is the Observer-specific
owner-scoped profile `2.0.0`.

## C01 scope

C01 moved the structural JSON Schema for the existing observation interchange
format into the contract registry. It did not change the accepted bundle
shape, the Firestore model, or the semantic validation behavior at that stage;
C02 now provides the contract-owned reference validator and canonicalization
boundary described below.

The release is identified by:

- contract ID: `jp.moukaeritai.observer.observation-interchange`;
- profile: `observer-owner-scoped`;
- contract version: `2.0.0`;
- schema ID: `2f1fd347-e99b-477e-884a-86a7dbb0358b`.

The schema ID is an opaque, lowercase, hyphenated UUIDv4. JSON Schema's `$id`
and the manifest's `schemaUri` use the exact corresponding URN:
`urn:uuid:2f1fd347-e99b-477e-884a-86a7dbb0358b`. The UUID is the identity of
the immutable schema artifact; the file path and registry entry are
distribution metadata, not a resolver.

No resolver from a UUID to a file, HTTP URL, repository, or schema is part of
C01. External `$ref` values are not allowed; the schema may use only
same-document fragment references.

The release artifact is immutable. If the schema or any other normative
release artifact changes, issue a new schema ID and a new release rather than
rewriting `2.0.0` in place. The interchange payload itself does not gain a
`schemaId` field in C01.

The registry and release manifest are machine-checked by:

```bash
npm run contracts:check
```

The SHA-256 recorded in the manifest is the hash of the exact UTF-8 bytes of
the release `schema.json`.

## C02 scope

C02 adds the reference validation boundary for the same immutable `2.0.0`
release. `src/contracts/validator.ts` executes the Draft 2020-12 Schema with
Ajv and `ajv-formats`, while `src/contracts/semanticValidation.ts` checks the
cross-record rules that JSON Schema cannot express: deterministic membership
IDs, endpoint references, owner equality, ACL visibility, location ranges, and
timestamp ordering. Both layers return stable diagnostic codes and RFC 6901 JSON
Pointers through `src/contracts/diagnostics.ts`.

The contract-owned types are in `src/contracts/types.ts`; `src/types.ts`
re-exports them and retains only application projections, drafts, Firebase
collection names, and user types. The existing functions in
`src/domain/observationInterchange.ts` remain compatibility wrappers used by
the UI and service, but their bundle assertion now calls the reference
validator. Deterministic ordering and serialization helpers are in
`src/contracts/canonicalize.ts`.

The non-normative release examples and conformance vectors are stored under:

```text
contracts/observer-observation-interchange/releases/2.0.0/examples/
contracts/observer-observation-interchange/releases/2.0.0/test-vectors/
```

They do not change the Schema, manifest, payload, or release identity. Run the
reference-vector tests with:

```bash
npm run test:contracts
```

C02 still does not implement a UUID resolver, public generated API, external
`$ref`, Firestore import commit, or a generic profile independent of the
Observer owner-scoped rules.
