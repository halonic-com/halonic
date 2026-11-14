# Decision: a deploy lock lost after traffic switched is a warning, not a failure

- Approval: Liam asked for this in his review of PR #2652 (HAL-9253) and filed it as HAL-9255; the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-9255

## What changes

`deploy.orchestrate` now says the lock is checked right before traffic changes. If it is lost by
then, the deploy stops with `deploy-lock-lost`. If it is lost after that, the result is `deployed`
with a warning instead of an error. Two examples are added (lost before the switch, lost after).
No example was removed or weakened.

## Why

Before this, a lock lost after the switch made the deploy report a failure although the new
version was already live, so the user would retry or roll back a deploy that had worked. Before the
switch, stopping is still safe, so that check stays an error.

## Covers

- deploy.orchestrate
- packages/targets/cloudflare/deploy/src/deploy.test.ts
