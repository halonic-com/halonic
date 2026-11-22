# Decision: the Cloudflare target's `deploy` is built, and a lock taken after the plan names its holder

- Approval: the build plan was approved by Liam on HAL-13512, the entry's design is on HAL-6702 (deploy-target-entry), and Liam chose on HAL-16060 that the Worker is built at release; the reviewer approves this note in review
- Kind: internal

## What changes

- `deploy.target-entry` said `deploy` and `revokeSessions` reject with `unexpected` until the next part. `deploy` is built in this PR, so the sentence now names only `revokeSessions`, and says `deploy` works as the new requirement `deploy.target-deploy` says.
- `app.deploy-service` checks the lock before any question. It now also says what happens when another deploy takes the lock between that check and the deploy: the service reads the holder again and stops with the same `conflict` message. This is Liam's note 1 on PR 07, done without a port change.

## Why

The sentence in `deploy.target-entry` said what wasn't there yet. In the app service, a lock taken in that gap reached the user as the target's own failure, without Sofia's words (flow 3.7) or the time the lock runs out.

## Tests

`deploy-target-deploy.test.ts` checks `deploy` against the fake Cloudflare API: a first deploy, a deploy over a live version, a failed self-test, a stop, and no Worker loader. `deploy-service.test.ts` checks the lock race, with and without a holder to read.

## Covers

- deploy.target-entry
- app.deploy-service
