# Decision: a lock the deploy held and lost says what still serves, so it isn't read as a race

- Approval: Liam asked for it in the PR 11 review on HAL-6702 (the `definitions-written` note); the reviewer approves this note in review
- Kind: internal

## What changes

- `deploy.target-deploy` adds one sentence and one example: a lock the deploy held and lost before traffic moved rejects with `deploy-locked`, what still serves (`live`) and the step it stopped after.
- `app.deploy-service` says the service also passes on the target's own failure when it says what still serves. Before, it passed it on only once a step had reported `done`.

## Why

The app service turns a `deploy-locked` failure into Sofia's 3.7 message, which ends "Nothing changed on Cloudflare.", while no step has finished. A lock lost at the renewal after the snapshot was written (and no database changes applied) reported no finished step, so the message was wrong: the snapshot was written. What's live didn't change, because the version is pinned with `HALONIC_DEFINITIONS_VERSION`. A lost lock now says what still serves, which keeps it apart from a deploy that lost the race before it began, with no port change.

## Tests

`deploy-target-deploy.test.ts`: a lock taken over once the snapshot is written rejects with `deploy-locked` and version 1 as `live`, and nothing is uploaded. `deploy-service.test.ts`: a `deploy-locked` failure with `live` set is passed on, not rewritten.

## Covers

- deploy.target-deploy
- app.deploy-service
