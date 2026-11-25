# Decision: merge control takes built-on:halonic like built-on:paperclip, and reopens an approved label-noop pull request once per head

- Task: HAL-18470
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18424 (Chief's yes to the label-noop self-fix, 25 Nov 11:30 UTC; the live Merger runs both changes since 12:02 UTC; the reviewer approves this note in review)
- Kind: internal

Merge control now queues a `built-on:halonic` pull request like a `built-on:paperclip` one, and closes and reopens an approved pull request once per head when only a label run kept it out of the queue, so the plugin decides the same as the live Merger.

## What changes

- `paperclip.merge-control-merge-state`: a non-draft pull request labelled `built-on:halonic` is a candidate exactly like one labelled `built-on:paperclip`. It no longer needs `fast-track` to be looked at. The HAL-18304 example ("enqueued only when `fast-track` was added by a configured labeller") is replaced by two: both labels get the same verdict and actions in six states, and a `built-on:halonic` pull request with `fast-track` goes first only when a configured labeller added it. `fast-track` from anyone else still never counts and is still logged. The `built-on-halonic.test.ts` cases that expected a plain `built-on:halonic` pull request to stay out now expect it to be queued. No other test or `expect` is removed.
- `paperclip.merge-control-write-scope`: the write client may also send the `closePullRequest` and `reopenPullRequest` mutations, each with only the pull request's id, as POSTs to the GraphQL endpoint. "Six allowed writes" becomes eight. Every other refusal stays.
- New `paperclip.merge-control-label-noop-reopen`.

## Why

- **Same label rule as the live Merger.** Since 25 Nov 12:02 UTC the live Merger uses one `BUILT_ON` set for both labels. The plugin must decide the same, or the shadow diff counts every `built-on:halonic` pull request as a disagreement. The board's words on HAL-18304 were "built-on:halonic should not be automatically fast tracked, only if it has the label". This change keeps that: `built-on:halonic` alone queues a pull request normally and never makes it fast-track. Only the HAL-18304 reading that it shouldn't be queued at all without `fast-track` is dropped.
- **Label-noop self-fix.** Approved pull requests sat out of the queue for hours after a label-only CI run: #5888 for 9 hours, #5894 for 9 hours, #5738 for 6 hours. The fix is always the same close and reopen, and the Merger only reported it. A reopen keeps the head, so it keeps the approval. The loop stop (a second head within a day) keeps a pull request that keeps getting label runs from being reopened over and over.
- **No new token permission.** Closing and reopening a pull request uses the same pull-request write access the queue credential already uses to queue, dequeue and comment. The only thing that grows is the client's allowlist, by two mutations.

## Covers

- paperclip.merge-control-merge-state
- paperclip.merge-control-write-scope
- paperclip.merge-control-label-noop-reopen
