# Decision: merge groups and pushes build Studio in two shards, five in all

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18424 (Chief, 26 Nov 08:58 UTC: the studio split goes to Mateo, HAL-19508; Liam decides on it in review and signs this note if he takes it)
- Kind: internal

The merge queue's `studio` shard (`features-a`, `features-b` and `studio-testing` of the pull-request shards) becomes two: `studio-features` (`features-a`, `features-b`) and `studio-testing`. Everything else stays as HAL-17908 set it.

## What changes

- `.github/workflows/ci.yml`: `QUEUE_BUILD_SHARDS` has five lines instead of four, and the build job's matrix lists the five names outside a pull request. Pull requests keep their nine shards. `trace` and `base-tests` read the queue's names as before; a main run from before this change has no `studio-features` archive and is passed over until its 1-day artifacts expire, so the merge base is tested instead, as HAL-17908's switch did.
- `check.ci-queue-build-shards`: "three or four lines" becomes "three to five"; the examples name the five shards. Its wiring test allows five; no other `expect` changes.

## Why

- On 26 Nov `studio` was the slowest build shard in 8 of 9 sampled green groups (3.3 to 6.5 min, every other shard at most 3.7), and `trace`, the last job of the run, waits for it.
- Its tests miss the cache whenever core, the lockfile or Studio change: 19 of 40 groups had it under 60% cached in the morning sweep, about 5.5 min against 0.7 cached. Two halves take roughly half each, so those groups end about 2 to 3 min sooner.
- The cost is one more large slot per group, about a minute in a cached group. HAL-17908 went from nine to four because groups waited for slots; slot waits in the sample were 0.1 to 2.2 min.

## Covers

- check.ci-queue-build-shards
- .github/
- tooling/check/
