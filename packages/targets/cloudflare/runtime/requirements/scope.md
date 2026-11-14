# runtime.scope

- Status: active
- Since: 0.1.0
- Source: HAL-6803; build plan part 10 (HAL-197)

When a runtime is built with a scope, the blobs, the definition snapshot and every Durable Object it names shall live under that scope, so two runtimes with different scopes on the same bindings share nothing, and a runtime built without a scope shall use the names a deployment has. Only a test sets a scope.

Rationale: the target contract suite runs every case on one set of bindings, and each case has to start empty.

## Examples

- Given two runtimes with different scopes, when one stores a blob, then the other doesn't find it.
- Given a runtime with no scope, then its blobs, definitions and Durable Objects are the deployment's own.
