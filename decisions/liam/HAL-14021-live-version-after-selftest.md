# Decision: a first deploy runs its self-test before it reads the new version's id

- Task: HAL-14021 (follows HAL-13834, #4096)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14021 (CTO decision on the failing `live-cloud` gate; the security reviewer approves this note in review)
- Kind: internal

## What changes

The requirement `deploy.upload` gains one sentence and one example. A Worker that was never
deployed (or a deploy with Durable Object migrations) uploads live. Its self-test now runs right
after that upload, and the deploy reads the new version's id afterwards. It asks again for about
a minute while Cloudflare doesn't list the deployment yet, and it ignores a list that still names
the previous version.

Nothing existing is removed or weakened. The self-test still has to pass, a failure still says the
new version is live and why, and the token rules are the same. No test is skipped, loosened or
deleted; tests for the late list and the stale list are added.

## Why

Cloudflare's deployment list often lags more than the ~10 s that #4096 waited, even with no
other deploy running. 3 of the first 4 `live-cloud` runs that included #4096 failed there, and so
did a re-run on #3967 with the account idle. A live upload doesn't need that list for its
self-test: it holds all traffic, and only it has this upload's token.

## Covers

- deploy.upload
