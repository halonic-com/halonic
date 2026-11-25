# Decision: merge control takes built-on:halonic like built-on:paperclip, and reopens an approved label-noop pull request once per head

- Task: HAL-18470
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18424 (Chief's yes to the label-noop self-fix, 25 Nov 11:30 UTC; the live Merger runs both changes since 12:02 UTC; Julian's OK for the close and reopen writes on HAL-18482; the reviewer approves this note in review)
- Kind: internal

Merge control now decides like the live Merger has since 25 Nov 12:02 UTC. A pull request labelled `built-on:halonic` is a candidate exactly like one labelled `built-on:paperclip`, and an approved pull request stuck on a label-only CI run is closed and reopened once per head. The requirement `paperclip.merge-control-merge-state` and its tests change, `paperclip.merge-control-write-scope` grows by two writes, and `paperclip.merge-control-label-noop-reopen` is new.

## What changes

- `paperclip.merge-control-merge-state`: a non-draft pull request labelled `built-on:halonic` no longer needs `fast-track` to be looked at. The HAL-18304 example ("enqueued only when `fast-track` was added by a configured labeller") is replaced by two. Both labels get the same verdict and actions in six states. A `built-on:halonic` pull request with `fast-track` goes first only when a configured labeller added it; from anyone else it is queued normally and logged.
- `built-on-halonic.test.ts` goes from 7 tests to 5. The HAL-18304 cases that expected a plain `built-on:halonic` pull request to stay out now expect it to be queued. The two `fast-track` cases (configured labeller, and other or unknown labeller) and the draft case are merged into the new cases: the draft is one of the six states, and the jump rule is still tested. The `built-on:paperclip` case became the six-state comparison.
- `paperclip.merge-control-write-scope`: the write client may also send the `closePullRequest` and `reopenPullRequest` mutations, each with only the pull request's id, as POSTs to the GraphQL endpoint. "Six allowed writes" becomes eight.

## Why

The plugin must decide the same as the live Merger, or the shadow diff counts every `built-on:halonic` pull request as a disagreement. The board's words on HAL-18304 were "built-on:halonic should not be automatically fast tracked, only if it has the label". That still holds: `built-on:halonic` alone queues a pull request normally and never makes it fast-track. Only the HAL-18304 reading that it isn't queued at all without `fast-track` is dropped.

Approved pull requests sat out of the queue for hours after a label-only CI run: #5888 and #5894 for about 9 hours each, #5738 for 6 hours. The fix was always the same close and reopen, and the Merger only reported it. A reopen keeps the head, so it keeps the approval. The stop on a second head within a day keeps a pull request that keeps getting label runs from being reopened over and over. Closing and reopening uses the same pull-request write access the queue credential already uses to queue, dequeue and comment; only the client's allowlist grows.

## Covers

- paperclip.merge-control-merge-state
- paperclip.merge-control-write-scope
- paperclip.merge-control-label-noop-reopen
- tooling/paperclip/src/merge-control/built-on-halonic.test.ts
