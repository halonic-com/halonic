# Decision: D1 rows live under the runtime's scope

- Approval: HAL-13216 (plan revision 3), part of the selling layer's S1 on HAL-13207
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:c7N/xy7pDmX8Vg7HQStBTJtt2WwRre6y19FSrpNArOzQ36OiPVLJC3CFiF1tBNdULwFLLcPvRJEd9BdqbqZtCg==

A runtime is now built per request under its principal's scope, a user's
`u/<id>` or an organisation's `o/<id>`. The blobs and every Durable Object
already lived under that scope, but the two D1 stores didn't: the record
store (which also holds the sign-in tokens' collection) had no scope at all,
and `createRuntime` built the run list without one. Every runtime read and
wrote the same D1 rows, whatever its scope.

What changes:

- Migration `0004-scope` adds a `scope` column to `record_changes`, moves the
  compaction claims to `record_compactions_scoped` (its key holds the scope,
  so two scopes compacting a collection of one name never claim each other's
  versions), and gives `run_list` the columns `started_by` and `visibility`.
  It only adds: rows already there belong to the empty scope, the
  deployment's own, and the old claims table is removed in a later migration.
- `D1RecordStore` and `D1RunList` take the scope as a required option, and
  every statement they send names it and binds it. The injection test now
  fails on a store statement that doesn't.
- `createRuntime` passes its scope to both stores.

Requirements edited, none weakened:

- `runtime.scope` now promises the records, the tokens and the run list too,
  and drops "Only a test sets a scope", which stopped being true when the
  runtime started being built for a request's principal.
- `cloudflare-storage.d1-record-store` adds the scope to every statement and
  says the rows from before belong to the empty scope.
- `cloudflare-storage.d1-run-list` makes the scope required, keeps scopes
  that start with one another apart, and says who started a row's run and
  that it is `private`.
- `cloudflare-storage.d1-record-store-collections` names only the store's own
  scope's collections.

Not in this change: a run object doesn't yet know the scope its name was
built under, so it still sends summaries to the empty scope's run list. That
is the background work the task gives to S1-5.

## Covers

- runtime.scope
- cloudflare-storage.d1-record-store
- cloudflare-storage.d1-run-list
- cloudflare-storage.d1-record-store-collections
