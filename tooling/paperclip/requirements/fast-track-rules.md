# paperclip.fast-track-rules

- Status: active
- Since: unreleased
- Source: HAL-16003; the supervision plugins plan on HAL-15997 (fast-track as rules inside `pr.watch`), approved by the board on 22 Nov; the fast-track rules of HAL-15971; the Fast-track monitor's rule list Chief posted on HAL-16003 on 23 Nov (HAL-16769); the board's changes of 24 Nov (Chief's comment on HAL-16003, HAL-17697, the Merger's "Fast-track PRs" rules 1–3; HAL-17722); the board's HAL-16003 scope note of 24 Nov (HAL-18007)

When a `pr-watch` pass has taken a company's GitHub snapshot, the plugin shall work out, for each open pull request labelled `fast-track`, the fast-track monitor's events: the first time it carries the label; a label added by anyone but the board (its login in the `fastTrackLabelAdder` setting) or `halonic-dev`, a label added as `halonic-dev` on a pull request that is neither listed in the `fastTrackSharedLabelScope` setting nor of a child task of a task listed there (by default HAL-17422, #5659 and #5674), a label by an adder GitHub doesn't give, or on a bot's pull request; a pull request ready for review (not a draft, no check still running) and not approved on its head by its reviewer (Julian on a pull request Liam wrote, Liam otherwise), to the task as soon as it is ready, and to the board 15 minutes later while it is still not approved on the same head; each failing check on a ready pull request's head, leaving out `Live cloud suites passed`, a decision note and the requirement guard while the note fails before approval, and a red `ci-ok` while it is red only through those or while another check still runs; approved and green for 10 minutes on the same head, based on the default branch and not queued, with a jump only when no other `fast-track` pull request is in the merge queue, the label counts, and more than 8 pull requests are queued or the board marked it as unblocking everyone, and otherwise without a jump; 30 minutes first in the merge queue; a failing or unmergeable merge group; leaving the queue without merging; and the merge. The plugin shall report each event once per pull request, stage and head or queue entry, log the new ones as one line per task, keep what it reported and a log of each `fast-track` queue entry's wait in plugin state, and write nothing to Paperclip or GitHub.

## Examples

- Given a pull request labelled `fast-track` that no pass saw before,
  when two passes run,
  then the first reports it as new and the second reports nothing.
- Given `fast-track` labels added by another account, by an adder GitHub doesn't give, and on a pull request by `dependabot[bot]`,
  when a pass runs,
  then it flags the first two as a wrong label and the third as a bot's pull request; a label added by the board it doesn't flag on any pull request.
- Given `fast-track` labels added as `halonic-dev` on a pull request of a child task of HAL-17422, on #5659 and on another pull request, with the setting unset,
  when a pass runs,
  then it flags only the third as a wrong label, with or without the board's login set, and asks a jump for it never.
- Given a pull request ready for review and not approved on its head, and one Liam wrote,
  when a pass runs,
  then it asks Liam on the task to review the first and Julian the second at once; for a draft or one with a check still running it asks nothing.
- Given a pull request ready for review and still not approved on the same head 15 minutes after a pass first saw it ready,
  when a pass runs,
  then it tells the board; after 14 minutes, or once the head changed, it doesn't.
- Given an unapproved pull request whose only failures are its decision note, the requirement guard and `ci-ok`, and an approved one with a failing `Lint`, `ci-ok` and `Live cloud suites passed`,
  when a pass runs,
  then it names no check for the first (whose requirement guard also fails), and `Lint` and `ci-ok` on the head for the second.
- Given an approved, green pull request first seen ready 11 minutes ago with 9 entries in the merge queue,
  when a pass runs,
  then it asks the Merger to queue it with a jump; with an empty queue it asks for no jump, unless the board marked it as unblocking everyone.
- Given that pull request while another `fast-track` pull request is in the merge queue, with 1 or 10 entries queued,
  when a pass runs,
  then it asks the Merger to queue it normally, without a jump, even when the board marked it as unblocking everyone; with a base other than the default branch it doesn't ask.
- Given a `fast-track` pull request 45 minutes in the merge queue at position 3,
  when a pass runs,
  then it doesn't report it as slow; at position 1 for 29 minutes it doesn't either, and for 31 minutes it does.
- Given a `fast-track` pull request first in the merge queue for 31 minutes with a failing group,
  when a pass runs,
  then it reports it as slow and its group as failing; once it leaves the queue unmerged it reports that, and when it merges it reports the minutes from the label to the merge and stops tracking it.
- Given a `fast-track` pull request first seen at position 1 of the merge queue with 4 entries queued before it,
  when it merges,
  then the jump log records 4 ahead, a jump, the estimated wait without it and the minutes from the queue to the merge.
