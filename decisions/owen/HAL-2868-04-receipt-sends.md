# Decision: the run history says what a run sent, per verb, as `sendsOf` reads it

- Approval: [HAL-2868](/HAL/issues/HAL-2868), for [HAL-2829](/HAL/issues/HAL-2829), from Sofia's wording call on [HAL-2848](/HAL/issues/HAL-2848) (a team decision); the package owner (Liam) approves this note in review on [HAL-6320](/HAL/issues/HAL-6320)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9Wbue9aRFGDSfLQkz+dQxnJYmrLAoKUQytcRCaWzB2BWpbsBJVq6bc8IOMapRmEXLVpzM+jV8HEKf1w2GsFZDw==
- Task: HAL-2868, part 4 of 4; the guard findings on [HAL-6387](/HAL/issues/HAL-6387)

## What changes

`app.run-list-facts`: the run history used to tell only whether a run made a tool call. It now
also tells what the run sent and what it may have sent, as `sendsOf` from the events package
reads them from the run's log (`events.summary-sends`, part 1 of this task). The requirement's
sentence says so, its source names the cli-output revision, and it gains one example: a run whose
log has a send tool's result with the noun email sent 1 email. The existing examples stay as
they are, and so does the rule about tool calls, which the "Sent nothing" line still needs.

## Why

The ✓ Done row of `halonic runs` and the `halonic run` receipt said "Sent 1 email" from a count
of tool calls, which the run log doesn't back. With `sendsOf` both read the same facts from the
log, grouped per verb, so Drive's tools read "saved 1 file" rather than "sent 1 file". The run
history is where the runs list gets its facts, so the requirement has to say what it now gives.

No test was weakened or removed.

## The expect count of `cli.commands.routines.watch`

The guard counted 227 `expect` calls for `cli.commands.routines.watch` on this pull request and
242 on the merge base. No check was lost. The pull request doesn't touch the files these tests
use, and no test of the requirement changed. The whole drop is in four tests that check inside
`vi.waitFor`, which counts each retry as more `expect` calls, so the count goes up and down with
how fast the runner is:

| Test | Merge base | Pull request |
| --- | --- | --- |
| `watch.test.ts`: starts a routine when it's due … until Ctrl C | 19 | 10 |
| `watch.test.ts`: prints a ✕ line for a routine whose run didn't start | 10 | 7 |
| `watch.test.ts`: ends with 143 at SIGTERM | 6 | 4 |
| `workspace-engine.test.ts`: gives up on a run whose step kept failing for an hour | 113 | 112 |

Run locally on the same five test files, the merge base made 228 and then 227 calls, and the pull
request 228. The guard reports the drop only because this pull request changes other files in
`apps/cli`.

## Covers

- app.run-list-facts
- cli.commands.routines.watch
