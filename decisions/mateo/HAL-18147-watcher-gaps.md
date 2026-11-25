# Decision: the PR watcher closes parked tasks whose pull requests landed

- Approval: Paperclip task HAL-18147, asked for by the board supervisor and Chief on HAL-17912 (25 Nov 03:28 UTC). Liam reviews the pull request on HAL-18147 and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VMfl1kx49DNLqAWbpEKeIG/GnKmYf6M48DhPsIklHojhZ52mJ4p6Anu+cVLizHUip5WicKCsFUFLZwtcfFIyAQ==

Until now the PR watcher never marked a task in `backlog` or `blocked` done
(`paperclip.pr-watcher-retargeted`, second paragraph). A task often stays
`blocked` on a security sign-off or a review task that has since finished, and
its pull request then merges before anyone moves it. On 25 Nov HAL-17635 sat
`blocked` after #5916 merged green, and the tasks it blocked stayed blocked
with it. The watcher has no project or label filter: this status rule was the
whole limit.

Now a parked task is done under the same rule as any other
(`paperclip.pr-watcher-done`): its pull requests landed green, its holder's
newest comment after the merge has no hold line, and it has no open child
task. One difference stays: a comment after the merge doesn't wake the holder
of a parked task, because a wake would pick the task up, and its holder put it
aside on purpose (HAL-17897 waits on a live check). Such a task stays as it is.

`paperclip.pr-watcher-retargeted` keeps its rule for the retargeted wake and
names the two new exceptions: done, and the wake for a held head
(`paperclip.pr-watcher-held`, new). In `host-parked.test.ts`, the test
"never marks a parked task done or hands it to a reviewer" is split: the
handoff half stays as it was, and the done half now checks that the adapter
marks a parked task done when the watcher decided so.

## Covers

- paperclip.pr-watcher-done
- paperclip.pr-watcher-retargeted
- tooling/paperclip/src/plugin/host-parked.test.ts
