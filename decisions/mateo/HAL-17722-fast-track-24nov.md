# Decision: the dry-run fast-track rules follow the board's changes of 24 Nov

- Approval: the board changed the fast-track rules on 24 Nov (Chief's comment on HAL-16003, HAL-17697, the Merger's "Fast-track PRs" rules 1–3); the work is HAL-17722, and Liam reviews it and signs this note as the CTO
- Kind: internal

The dry-run rules in `src/fast-track/` must say what the live Merger and
Fast-track monitor do, or the board supervisor's 2-day comparison on
HAL-16003 compares against old rules. Four things change, all still log
only:

- **Jumps (HAL-17697):** a `fast-track` pull request jumps only pull
  requests without the label. So it jumps only while no other `fast-track`
  pull request is queued, and then only with more than 8 ahead or its number
  in `fastTrackUnblocks`. While another one is queued it is no longer left
  out: `enqueue_ask` asks to queue it normally, without a jump, because the
  Merger now puts every ready `fast-track` pull request in during the same
  pass ("one jump at a time" is withdrawn).
- **Slow queue:** waiting behind others is normal without a jump, so
  `queue_slow` counts the minutes an entry has been first in the queue, not
  the minutes since it entered. The rules remember since when it is at
  position 1 (`firstInQueueSince`, absent in older state).
- **Review:** `review_nudge` goes to the task as soon as the pull request is
  ready for review, no longer 30 minutes after the label and no longer to
  the board. A new `review_escalate` tells the board 15 minutes later if it
  is still not approved on the same head (`reviewSince`, absent in older
  state).
- **Label adders:** a label added as `halonic-dev` counts, since the board
  and Chief label through it (the Merger's rule 3), on every pull request,
  next to the board's login from `fastTrackLabelAdder`. An adder GitHub
  doesn't give still never counts, and `bot_label` stays.

Requirement and test changes:

- `paperclip.fast-track-rules`: the text names `halonic-dev` as a counted
  adder, the review stages at once and after 15 minutes, a jump only with no
  other `fast-track` pull request queued, a queue ask without a jump
  otherwise, and 30 minutes first in the queue. Its examples change to
  match: `halonic-dev`'s label is no longer flagged; the review example no
  longer waits for 30 minutes after the label; "doesn't ask the Merger"
  while another is queued becomes "asks without a jump".
- In `src/fast-track/rules.test.ts`: "flags a label nobody allowed" flags
  another account instead of `halonic-dev`; "asks the reviewer 30 minutes
  after the label" becomes "asks the reviewer on the task as soon as it is
  ready" (to the task only); "doesn't ask while another fast-track pull
  request is queued" becomes "asks without a jump while another …"; and
  "follows it through the queue" gives the entry 31 minutes first in the
  queue before it expects `queue_slow`.

## Covers

- paperclip.fast-track-rules
- tooling/paperclip/src/fast-track/rules.test.ts
