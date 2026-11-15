# Decision: a live suite package for the Cloudflare Worker, with the webhook checks

- Approval: the task asks for this change (HAL-9962, for HAL-9955); Liam approves this note in review
- Kind: internal

## What changes

- A new package, `@halonicjs/testing-cloudflare-live`, with a `test:live` script, in `packages/testing/cloudflare-live`. It is dev-only and depends on no target code, and the layout table has no `live` folder under a target, so it lives with the testing packages. `live-cloud.yml` already runs `pnpm -r run test:live` once a package has one.
- New requirement `cloudflare-live.webhooks`: signed deliveries are sent to a deployed Worker over the network. A wrong signature, an old timestamp and an unknown address are checked live. The run-start and replay checks are pending: they assert today's 501 and fail the day the Worker answers anything else.

## Why

HAL-9923 is merged, so the Worker's webhook answers can be checked on the real account. A pending check that asserts today's answer can't be skipped by accident, and the package preset (which fails a run that skips a test) stays on for the normal tests.

The replay check can't be live yet. A first delivery the Worker answers 501 gives its id back for a retry, so a repeated id also gets 501, never 409. It becomes live with run start.

## Tests

15 unit tests run the checks against a Worker in memory, with an HMAC check written separately from the signing code, and against Workers that answer wrongly. Nothing was run against Cloudflare: the CI account's token isn't set up yet (HAL-6829).

## Covers

- cloudflare-live.webhooks
