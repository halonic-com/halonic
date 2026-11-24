# Decision: the PR watcher hands a ready pull request's task to its reviewer

- Approval: the board decided on HAL-10 (24 Nov 16:35 UTC) that the watcher hands a ready, green pull request to its reviewer and warns once on a push after an approval; the work is HAL-17675, and Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:IVfdbftV+XTDh+kea9dxZRWDKNBT9JSwQer3N+CmKhK2BexGtpgsd41NbEx0IEaRAh/iRLX79SsYSwoQpHBZCA==

Until now the watcher changed a task only by setting it `done`. It may now
also give a task to its reviewer with status `todo`: the host adapter's
new `handoffOnly` allows exactly `assigneeAgentId` and `status: "todo"`,
nothing else, and `handOff` re-reads the task first and leaves it alone
when the author handed it on, closed it or started a run meanwhile
(`paperclip.pr-watcher-handoff`). A push after an approval gets one task
comment that wakes nobody (`paperclip.pr-watcher-pushed-after-approval`).

The GitHub token stays read-only (`paperclip.pr-watcher-read-only` is
unchanged), so the watcher can't comment on the pull request itself: the
warning goes on the task only. A pull request comment needs a token that
can write, which is a separate decision.

Three requirement texts change with it:

- `paperclip.pr-watcher-plugin`: "change a task's status only to `done`"
  becomes "only by setting its status to `done` or by giving it to its
  reviewer with status `todo`", and its refusal example names both.
- `paperclip.pr-watcher-wake`: the example "a pull request with a green
  `ci-ok`, no conflict and no new review comment … does nothing" now says
  it wakes nobody for it, since the task may go to its reviewer.
- The test for that example in `src/pr-watcher/watch.test.ts` ("wakes
  nobody for a green pull request without findings") now expects the
  handoff's log line before "nothing to do", and checks that nobody was
  woken, instead of expecting only the "nothing to do" line.

## Covers

- paperclip.pr-watcher-plugin
- paperclip.pr-watcher-wake
- tooling/paperclip/src/pr-watcher/watch.test.ts
