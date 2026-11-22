# Decision: the Cloudflare target's `plan` is built, so it no longer rejects

- Approval: the build plan was approved by Liam on HAL-13512, and the entry's design is on HAL-6702 (deploy-target-entry); the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:LmwV79jSPjMlmdcjIZmIVRXlJpgsHhgExoaaHobE7rBlLv1Gar0SGJl/7zcqU65huNEs0LBM3p60hbkFQsb/BQ==

## What changes

- `deploy.target-entry` said `plan`, `deploy` and `revokeSessions` reject with `unexpected` until the next part. `plan` is built in this PR, so the sentence now names only `deploy` and `revokeSessions`, and says `plan` works as the new requirement `deploy.plan` says. Nothing else in the requirement changes.

## Why

The sentence said what wasn't there yet. `plan` is there now, and the command needs it before it asks anything (deploy flow 2.7 and 3.7).

## Tests

`deploy-target-plan.test.ts` checks `plan` against the fake Cloudflare API: a first deploy, a live version, a lock held by someone else, and a lock that can't be read. `deploy-target-entry.test.ts` still checks that `revokeSessions` rejects with `unexpected`.

## Covers

- deploy.target-entry
