# cloudflare-live.fixture

- Status: active
- Since: unreleased
- Source: HAL-9962 (for HAL-9955); build plan 3c (HAL-6706); multi-cloud ADR 5.9

The live suite shall deploy its own Worker with one enabled webhook routine into the live test account, name every resource it makes with the run's `hlt-` prefix, and delete all of it when the suite ends or when a step of the deploy fails. The Worker's workers.dev host shall be the only host the Worker answers to. A fixture whose prefix doesn't start with `hlt-` shall be refused before anything is created.

Rationale: a live suite that needs a hand-made Worker can't run in CI, and a leaked Worker or bucket costs money and hides in the account. Names with the prefix let the sweeper find what a dead run left behind.

## Examples

- Given the prefix `hlt-7-1`, then the Worker is `hlt-7-1-w` and its database and buckets start with `hlt-7-1-w`.
- Given a failing upload, then the Worker's database and buckets made so far are deleted and the error is thrown.
- Given the prefix `prod`, then nothing is created and the call throws.
