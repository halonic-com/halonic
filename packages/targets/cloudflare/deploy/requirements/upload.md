# deploy.upload

- Status: active
- Since: 0.1.0
- Source: HAL-6704, HAL-6804; build plan 3a (HAL-198); multi-cloud ADR 5.6

The deploy shall check that the Worker script matches the hash its build reported, upload it as a version that serves no traffic with its secrets in the same upload, run the Worker's self-test against that version, and switch all traffic to it only when the self-test passed. When it fails, the previous version stays live and the deploy stops with a typed error naming the failed checks. The self-test token shall be at least 32 random bytes, made for each upload, sent as a secret binding and never logged, stored or put in an error. Preview addresses shall be off. A Worker that was never deployed, and a deploy that applies Durable Object migrations, can't be tried first (Cloudflare applies those only with an immediate deploy), so they upload live and then run the self-test; a failure then says the new version is deployed and why it was live first. A deployment holds two versions at most, so the 0% version is added next to the versions that have traffic only; when two versions share traffic the deploy stops before uploading, with `traffic-split-in-progress`. The `old_tag` of a Durable Object migration on an existing Worker is not sent yet (not proven live).

Rationale: a deploy that breaks the live Worker is worse than one that stops; the self-test route stays on the live version, and the per-upload token that opens it is kept by nobody.

## Examples

- Given a script whose hash differs from the build's, then nothing is uploaded and the deploy stops with `bundle-hash-mismatch`.
- Given a live version and a passing self-test, then the new version is deployed at 0%, tested with the version override, then at 100%.
- Given a failing self-test, then the previous version is put back at 100% and the deploy stops with `smoke-test-failed`.
- Given a Worker with no deployment, then it uploads live and the self-test runs against it.
- Given a leftover 0% version, then it is dropped from the new deployment; given two versions with traffic, then nothing is uploaded.
- Given known token and secret values, then no progress event or error message contains them.
