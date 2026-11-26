# Decision: merge control takes out a cancelled group's culprit and names non-main bases as the live Merger does

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18424 (Chief's OK for both live Merger fixes, 26 Nov 08:58 and 09:07 UTC, required jobs only; the plugin mirror is HAL-19508)
- Kind: internal

Merge control now dequeues a queued pull request in the same pass when its own merge group ends `cancelled` with a failed job that `ci-ok` needs, as it does for `failure`. Fail-fast cancels a group at its first failed job, so failed groups end `cancelled`: on 26 Nov the live Merger left 8 culprits queued for 1–12 minutes because its dequeue only looked at `failure`. The live Merger dequeues them since 09:11 UTC.

## What changes

- `paperclip.merge-control-dequeue-at-failure`: "ends `failure`" becomes "ends `failure`, or `cancelled` with a failed job `ci-ok` needs". The example "a group ending `cancelled`: nothing is dequeued" now reads "cancelled with no failed job, or only the fail-fast watcher failed"; a new example replays run 45764061940 (#6381). In `dequeue-at-failure.test.ts` the case "a cancelled group isn't dequeued" now uses a cancelled group with no failed job, its expectations unchanged; new cases add the replay, the watcher-only group and a cancelled hook-refused group.
- `paperclip.merge-control-culprit-hold`: the example "a group cancelled with a failed job whose pull request is still queued: nothing held, looked at again next pass" now names a group whose only failed job `ci-ok` doesn't need, since a failed required job dequeues it. The `culprit.test.ts` case uses that group; its expectations stay as they were.
- New `paperclip.merge-control-other-base` and `paperclip.merge-control-security-signoff`. No other test or `expect` is removed or weakened.

## Why

- **Same rules as the live Merger.** The shadow diff counts every difference, and a culprit left in the queue makes every group behind it build on a failed one.
- **Required jobs only** (Chief, 26 Nov 09:07): a failed job outside `ci-ok`'s needs, such as the fail-fast watcher, doesn't fail the group, so it still waits.

## Covers

- paperclip.merge-control-dequeue-at-failure
- paperclip.merge-control-culprit-hold
