# M2M audit artifacts

The JSON files in this directory preserve the fixed WP00 A8 registry and
external-verification baseline. `scripts/verify-m2m-harness.mjs` intentionally
checks their exact IDs, mappings, hash, and baseline state.

In particular:

- `requirements.json`, `verification-catalog.json`, `manual-checks.json`, and
  `work-packages.json` form a hash-locked registry.
- `progress.json` and `handoff.json` describe the accepted WP00 A8 handoff at
  commit `1617d76530ee17610aed5e2a2e89d15cd00c66a2`.
- Their `WP01`–`WP07: PLANNED` values are historical baseline values, not the
  current implementation status.

Do not update these files merely to report later work. The current status,
acceptance gaps, and iteration estimate are maintained in
[`docs/work-packages.md`](../../docs/work-packages.md).

Changing the fixed registry or converting the harness into a cumulative status
ledger is a separate audit-protocol change and requires its own work package.
