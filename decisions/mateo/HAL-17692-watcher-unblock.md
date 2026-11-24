# Decision: a hold line counts only after the merge, and the watcher unblocks dependents

- Approval: HAL-17692, the board's ask on HAL-10 (24 Nov, 17:15 UTC) after HAL-17446 and HAL-17458 stayed blocked behind merged work; fast-track
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:UBGJuUtWTuGcyuV9YRx4Fdoafh77yxisnLo8lyF6MBndfgISTNgOoRHwcNc51z93pBFmSfISOssiQWsYf5WtAw==

#5626 (HAL-17445) merged at 13:28 UTC, but its author had put the line
`PR watcher: more PRs to come` under every task comment, the last one
before the merge included. The watcher read that as a hold and left the task
open, so HAL-17446 stayed blocked for about 4 hours. HAL-17500 (#5653) the
watcher did close, 5 minutes after the merge, but nothing moved HAL-17458,
which it blocked, out of `blocked`.

- `paperclip.pr-watcher-done`: the hold line now counts only when the
  author wrote it after the last merge. One written before is the author's
  plan from before the merge. A task with more pull requests to come stays
  open by having the next one open, a draft included, or by the hold line
  written after the merge. The example for the hold line moves its comment
  after the merge, and a new one shows a hold line from before the merge
  closing the task.
- The new `paperclip.pr-watcher-unblock`: every pass, a blocked task an
  agent holds whose blockers are all done or cancelled goes to `todo`, and
  its agent is woken. This belongs in Paperclip itself; the plugin does it
  until Paperclip does.

## Covers

- paperclip.pr-watcher-done
