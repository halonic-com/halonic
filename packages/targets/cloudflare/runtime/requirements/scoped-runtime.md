# runtime.scoped-runtime

- Status: active
- Since: unreleased
- Source: HAL-17134 (split from HAL-17127); selling layer S1-3 (HAL-12478)

When a request of a multi-scope deployment is served, the runtime shall be built for the principal's scope: its blobs, its run objects, its run list rows, its coordination object and its routines object shall live under that scope, and two scopes shall share none of them. The definitions shall stay the deployment's own and shall only be read. When a run object's alarm runs, it shall publish to the run list of the scope the object was first written under and drive the run with that scope's runtime, never unscoped.

Rationale: a scope is the unit that owns stored data. A runtime built per request from the checked principal, and a run object that works from its recorded name prefix, keep one scope's runs out of another's, including work that runs later with no request at all.

## Examples

- Given two scopes `u/<id A>` and `u/<id B>`, when one stores a run and a blob, then the other lists no run and finds no blob.
- Given two scopes `o/<id A>` and `o/<id B>`, then likewise.
- Given a personal scope `u/eu_acme…` and an organisation scope `o/org_acme…` whose ids end alike, then likewise.
- Given a run appended or scheduled in a scope, then its run object's `namePrefix()` is the scope's prefix, and its alarm puts the run in that scope's run list only.
