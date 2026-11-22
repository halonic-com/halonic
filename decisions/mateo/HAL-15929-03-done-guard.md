# Decision: the PR watcher doesn't close a task that got comments after its merge

- Approval: Liam reviews this change to the PR watcher and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8k98Gic/ewqweUABw/RnuLxpq4FhrWWhVO8r6mUYzJXo0t8mukM0IPIAAe3Hp20LjVGUsjdOu62QJUFM8EReDw==

The board asked Mateo and Liam to check the PR watcher's first dry run on
HAL-15929 (22 Nov, 11:04 UTC) before it goes live. 3 of its 19 "done"
decisions were wrong. HAL-12499, HAL-15492 and HAL-15889 each had every pull
request merged with a green `ci-ok`, but still had work that isn't a pull
request: a follow-up for the same pull request added on the task, a deploy
the board's CI session still has to confirm, and an hourly run that has to
start on schedule. All three tasks got a comment after their last pull
request merged, and none of the 16 correct ones did.

- `paperclip.pr-watcher-done`: the watcher marks a task done only when nobody
  but the watcher has commented on it since its last pull request merged.
  Otherwise it wakes the author once for that merge, saying to mark the task
  done if nothing else is left. The author decides; the watcher never closes
  it on that merge.
- `paperclip.pr-watcher-wake`: a conflict on a draft pull request no longer
  wakes the author. A draft is the author's work in progress (#5021 in the
  same dry run). A failed `ci-ok` on a draft still wakes them.
- The hold test in `tooling/paperclip/src/pr-watcher/watch.test.ts` lifted
  its hold with a comment posted after the merge. Under the new rule that
  comment wakes the author instead of closing the task, so the test's
  lifting comment now comes before the merge. The test still checks the
  same thing: a newer author comment without the hold line lifts the hold.

## Covers

- paperclip.pr-watcher-done
- paperclip.pr-watcher-wake
- tooling/paperclip/src/pr-watcher/watch.test.ts
