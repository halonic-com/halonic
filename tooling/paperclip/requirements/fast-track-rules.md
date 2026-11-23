# paperclip.fast-track-rules

- Status: active
- Since: unreleased
- Source: HAL-16003; the supervision plugins plan on HAL-15997 (fast-track as rules inside `pr.watch`), approved by the board on 22 Nov; the fast-track rules of HAL-15971; the Fast-track monitor's rule list Chief posted on HAL-16003 on 23 Nov (HAL-16769)

When a `pr-watch` pass has taken a company's GitHub snapshot, the plugin shall work out, for each open pull request labelled `fast-track`, the fast-track monitor's events: the first time it carries the label; a label added by anyone but the board (its login in the `fastTrackLabelAdder` setting), or by an adder GitHub doesn't give, or on a bot's pull request; a ready pull request not approved on its head by its reviewer (Julian on a pull request Liam wrote, Liam otherwise) 30 minutes after the label, with no check still running; each failing check on a ready pull request's head, leaving out `Live cloud suites passed`, a decision note and the requirement guard while the note fails before approval, and a red `ci-ok` while it is red only through those or while another check still runs; approved and green for 10 minutes on the same head, based on the default branch and not queued, while no other `fast-track` pull request is in the merge queue, with a jump only when more than 8 pull requests are queued or the board marked it as unblocking everyone and the board added the label; 30 minutes in the merge queue; a failing or unmergeable merge group; leaving the queue without merging; and the merge. The plugin shall report each event once per pull request, stage and head or queue entry, log the new ones as one line per task, keep what it reported and a log of each `fast-track` queue entry's wait in plugin state, and write nothing to Paperclip or GitHub.

## Examples

- Given a pull request labelled `fast-track` that no pass saw before,
  when two passes run,
  then the first reports it as new and the second reports nothing.
- Given `fast-track` labels added by `halonic-dev`, by an adder GitHub doesn't give, and on a pull request by `dependabot[bot]`,
  when a pass runs,
  then it flags the first two as a wrong label and the third as a bot's pull request.
- Given a ready pull request labelled 60 minutes ago and not approved on its head, and one Liam wrote,
  when a pass runs,
  then it asks Liam to review the first and Julian the second; for one labelled 10 minutes ago it asks nothing.
- Given an unapproved pull request whose only failures are its decision note, the requirement guard and `ci-ok`, and an approved one with a failing `Lint`, `ci-ok` and `Live cloud suites passed`,
  when a pass runs,
  then it names no check for the first (whose requirement guard also fails), and `Lint` and `ci-ok` on the head for the second.
- Given an approved, green pull request first seen ready 11 minutes ago with 9 entries in the merge queue,
  when a pass runs,
  then it asks the Merger to queue it with a jump; with an empty queue it asks for no jump, unless the board marked it as unblocking everyone.
- Given that pull request while another `fast-track` pull request is in the merge queue, or with a base other than the default branch,
  when a pass runs,
  then it doesn't ask the Merger.
- Given a `fast-track` pull request 31 minutes in the merge queue with a failing group,
  when a pass runs,
  then it reports it as slow and its group as failing; once it leaves the queue unmerged it reports that, and when it merges it reports the minutes from the label to the merge and stops tracking it.
- Given a `fast-track` pull request first seen at position 1 of the merge queue with 4 entries queued before it,
  when it merges,
  then the jump log records 4 ahead, a jump, the estimated wait without it and the minutes from the queue to the merge.
