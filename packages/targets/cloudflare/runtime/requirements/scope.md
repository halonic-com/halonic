# runtime.scope

- Status: active
- Since: unreleased
- Source: HAL-6803; build plan part 10 (HAL-197); scoped D1 (HAL-13216)

When a runtime is built with a scope, the records (the sign-in tokens' collection included), the run list, the blobs, the definition snapshot and every Durable Object it names shall live under that scope, so two runtimes with different scopes on the same bindings share nothing, and a runtime built without a scope shall use the names a deployment has and the D1 rows of the empty scope.

Rationale: a runtime is built for the scope of a request's principal, a user's `u/<id>` or an organisation's `o/<id>`, so one customer's data must never reach another's; the target contract suite also runs every case on one set of bindings, and each case has to start empty.

## Examples

- Given two runtimes with different scopes, when one stores a blob, then the other doesn't find it.
- Given two runtimes with different scopes, when one appends a record, then the other's record store has no change and no collection of it.
- Given two runtimes with different scopes, when one stores a sign-in token, then the other's token store doesn't have it, and setting or removing a token of the same name there leaves the first one's as it was.
- Given a runtime with no scope, then its blobs, definitions and Durable Objects are the deployment's own.
