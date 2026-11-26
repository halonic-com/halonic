# Decision: the precheck tags why it is unavailable and keeps a started check RUNNING

- Task: HAL-19369
- Approval: Julian approved this edit of `paperclip.ready-for-review` on HAL-19369, comment 38a0fc23-7b8c-49c9-8167-625ffb96a91b; he reviews it and signs this note
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:NNwMxMvsS4fvxcPM6XphlDs/SNFEI1flsuI0/lwk27acYkSGaU0QT7BpWb81YrcQhSszy+wHizQkgqY3cxGZDA==

## What changes

- `tooling/paperclip/src/plugin/ready-for-review.ts`: each `CHECK UNAVAILABLE` answer and its saved metric carry the cause (`queue-full`, `timeout`, `unreachable`, `http-5xx`). In the call that started a check, a read that fails after the service took the check answers `RUNNING` with the check's id instead of `CHECK UNAVAILABLE`. The start request gets 5 seconds instead of 2, still inside the 6-second budget.
- `tooling/paperclip/requirements/ready-for-review.md`: the requirement and its examples say the same. A later call with `checkId` whose read fails still answers `CHECK UNAVAILABLE`.

## Why

13% of prechecks answered `CHECK UNAVAILABLE` (HAL-17309 re-measure), and the metric did not say why. A failed read after a successful start lost the check's id although the check kept running, and a start the plugin gave up on after 2 seconds could still queue a check nobody read, which filled the service's queue further. The cause tag lets the 24-hour re-count show the real split. The service-side causes go to HAL-19378.

## Tests

No test was skipped or weakened. `ready-for-review.test.ts` covers the cause tag on an unavailable answer and `RUNNING` with the check's id when a read fails after the start.

## Covers

- paperclip.ready-for-review
