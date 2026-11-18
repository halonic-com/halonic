# cloudflare-live.adapters

- Status: active
- Since: unreleased
- Source: HAL-6703 (step 2a of the HAL-198 build plan); multi-cloud ADR 5.9

The live suite shall run the Cloudflare adapters' own contract suites inside a test Worker deployed to the live test account, over real R2 buckets and a real D1 database, and show every case as its own test. The test Worker shall answer only a request that carries its bearer token, and a Worker deployed without a token shall refuse everything. The runner shall name every resource it makes with the run's `hlt-` prefix and delete all of it when the suite ends or when a step of the deploy fails.

Rationale: the contract suites already pass in a local workerd, but only the real services show what R2 and D1 do differently (limits, consistency, errors). The Worker runs code that writes to the account, and workers.dev is public, so it must not run for anyone without the token.

## Examples

- Given a Worker deployed with the token `t`, then a request without `Bearer t` gets 401 and runs nothing.
- Given the prefix `hlt-7-1-adapters`, then the Worker is `hlt-7-1-adapters-w` and its database and buckets start with that name.
- Given a failing upload, then the database and buckets made so far are deleted and the error is thrown.
