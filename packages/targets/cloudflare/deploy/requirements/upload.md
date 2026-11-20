# deploy.upload

- Status: active
- Since: unreleased
- Source: HAL-6704, HAL-6804, HAL-13834, HAL-13837; build plan 3a (HAL-198); multi-cloud ADR 5.6

The deploy shall check that the Worker script matches the hash its build reported, upload it as a version that serves no traffic with its secrets in the same upload, run the Worker's self-test against that version, and switch all traffic to it only when the self-test passed. When it fails, the previous version stays live and the deploy stops with a typed error naming the failed checks. The self-test token shall be at least 32 random bytes, made for each upload, sent as a secret binding and never logged, stored or put in an error. Preview addresses shall be off. A Worker that was never deployed, and a deploy that applies Durable Object migrations, can't be tried first (Cloudflare applies those only with an immediate deploy), so they upload live and then run the self-test; a failure then says the new version is deployed and why it was live first. Such a self-test needs no version id, since only the new upload holds its token, so the deploy reads the new version's id back after it, and asks again for about a minute while Cloudflare doesn't list the deployment yet. A deployment holds two versions at most, so the 0% version is added next to the versions that have traffic only; when two versions share traffic the deploy stops before uploading, with `traffic-split-in-progress`. The `old_tag` of a Durable Object migration on an existing Worker is not sent yet (not proven live).

While the Worker's address gives no answer or an HTTP error, the deploy shall try the self-test again, up to 5 tries in all, or 16 when this deploy turned workers.dev on (a first deploy, or an address that was off). The self-test shall take at most 2.5 minutes in all: a try is cut off at that limit and no try starts after it. Before each retry the deploy shall report a `self-test-retry` progress event with the number of that try and the most tries. A report that says a check failed is an answer and is not retried.

Rationale: a deploy that breaks the live Worker is worse than one that stops; the self-test route stays on the live version, and the per-upload token that opens it is kept by nobody. For up to about two minutes Cloudflare's edge answers 404 for a workers.dev address it just turned on, but an edge that takes the connection and never answers must not hold a deploy for 16 tries of 30 s each, and a deploy that waits shouldn't look stuck.

## Examples

- Given a script whose hash differs from the build's, then nothing is uploaded and the deploy stops with `bundle-hash-mismatch`.
- Given a live version and a passing self-test, then the new version is deployed at 0%, tested with the version override, then at 100%.
- Given a failing self-test, then the previous version is put back at 100% and the deploy stops with `smoke-test-failed`.
- Given a Worker with no deployment, then it uploads live and the self-test runs against it.
- Given a live upload that Cloudflare doesn't list yet, then the self-test still runs, and the deploy asks for the version id again afterwards.
- Given a leftover 0% version, then it is dropped from the new deployment; given two versions with traffic, then nothing is uploaded.
- Given a self-test report that says a check failed, then it is not tried again.
- Given an address that answers 404 and was already on, then the self-test is tried 5 times; given one this deploy turned on, then 16 times, with a `self-test-retry` event before each of the 15 retries.
- Given an address that takes the connection and never answers, then the deploy stops with `smoke-test-failed` after 2.5 minutes, not later.
- Given known token and secret values, then no progress event or error message contains them.
