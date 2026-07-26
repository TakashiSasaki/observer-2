# Observer contract registry

`contracts/` is the source-of-truth boundary for versioned interchange
contract artifacts. The first release recorded here is the Observer-specific
owner-scoped profile `2.0.0`.

## C01 scope

C01 moves the structural JSON Schema for the existing observation interchange
format into the contract registry. It does not change the accepted bundle
shape, the Firestore model, or the semantic validation behavior. The existing
semantic validator and deterministic canonicalization in
`src/domain/observationInterchange.ts` remain authoritative until a later work
package moves them into a contract package.

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
