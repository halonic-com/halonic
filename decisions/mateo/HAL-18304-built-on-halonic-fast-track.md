# Decision: the merge control queues a built-on:halonic pull request only with a verified fast-track label

- Approval: the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WWV1RWBW5kgHNnYZ/xyyWcENPz9erVhVkeuVh4qWiJiZ4uVuGSmfU8mOkO+J2emZBHMxupCeabcVNwp5Va8VBA==

## What changes

- `paperclip.merge-control-merge-state`: the gate also takes a non-draft pull request labelled `built-on:halonic` when it has `fast-track` added by a login in `fastTrackLabellers`. An unknown labeller never counts. Every other gate rule is unchanged. Such a pull request is a fast-track one, and it jumps only under the normal jump rule. `built-on:halonic` alone never queues it, and `built-on:paperclip` decides as before.

## Why

The board decided on 25 Nov 08:22 UTC (carried by Chief on HAL-17912 and HAL-16007): "built-on:halonic should not be automatically fast tracked, only if it has the label." A pull request built in Halonic should reach the queue the same way as a board-chosen fast-track one, not by its build label alone. The labeller check is the same one `verifiedFastTrack` already uses, so only the board's configured logins can let one in.

## Tests

`built-on-halonic.test.ts`: without `fast-track` it isn't a candidate. With `fast-track` from a configured labeller it goes first, and it jumps only with more than 8 queued. With `fast-track` from someone else or nobody known it isn't queued, and the label is logged as unverified. A draft never goes in. `built-on:paperclip` pull requests keep their order. The facts reader reads a `built-on:halonic` pull request only when it has `fast-track`.

## Covers

- paperclip.merge-control-merge-state
