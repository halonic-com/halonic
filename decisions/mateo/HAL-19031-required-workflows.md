# Decision: the PR watcher wakes a reviewer for a retargeted pull request

- Approval: asked for on HAL-19031 (from HAL-17866, the board's evidence of 26 Nov 00:59 UTC); Liam approves this note in his review of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1wTnAkwUU2GPvwJoUoG8CLXOVhpaYBjQX2FaIFMaMjYsPSH+eCZ2tP0dcJByc58/aNzbSkZEXlC85sXNwgDrDQ==
- Task: HAL-19031

## What changes

`paperclip.pr-watcher-retargeted` (unreleased) woke a task's holder only when the pull request's
author held it. #6183 was retargeted to `main` at 20:25 on 25 Nov while its reviewer held
HAL-18625, so nobody was told to close and reopen it until it was fixed by hand at 01:01. The
requirement now also covers a task held by its reviewer (Liam or Julian, when not the author):
the watcher comments and wakes the holder once per head, with the same text. Its examples add the
reviewer's case and the cases where a reviewer's task is left alone. Nothing it did before is
dropped.

## Tests

No test was skipped or weakened. `required-failed.test.ts` adds the reviewer's wake once per head
and the draft, queued and red-without-retarget cases; the existing retargeted tests are unchanged.

## Covers

- paperclip.pr-watcher-retargeted
