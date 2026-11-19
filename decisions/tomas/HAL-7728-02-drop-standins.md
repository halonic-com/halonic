# Decision: adapter-cloudflare-storage drops its Node stand-in tests

- Approval: Liam approves the change on HAL-13320 (https://paperclip.halonic.com/HAL/issues/HAL-13320#comment-46e15a0e-8b50-4729-89e2-16b7e16faa06), the continuation of HAL-7728. A team decision with no board card (HAL-2282 rule).
- Kind: internal

Since part 1 (`decisions/tomas/HAL-7728-01-workerd-coverage.md`), a `"runtime": "workers"`
package gets its coverage from workerd, so adapter-cloudflare-storage no longer needs Node tests
over stand-in bindings to reach its 80% floor. This change runs the same cases for the same six
requirements inside workerd, against real R2 and D1 bindings, and deletes the Node stand-ins,
including `src/sqlite-database.spec.ts`, which only tested the SQLite stand-in for D1. The
requirements below now make fewer expect calls because the stand-in cases also asserted what the
fake bindings did; the behaviour each requirement records is still checked, now against the real
bindings. No requirement changes, and coverage counted from workerd alone is 97.8% of lines.

## Covers

- packages/adapters/cloudflare-storage/src/sqlite-database.spec.ts
- cloudflare-storage.d1-run-list
- cloudflare-storage.r2-blob-store
- cloudflare-storage.d1-record-store
- cloudflare-storage.d1-record-store-collections
- cloudflare-storage.r2-definition-source
