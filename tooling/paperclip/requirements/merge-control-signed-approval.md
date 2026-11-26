# paperclip.merge-control-signed-approval

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14786, HAL-14625; MERGER.md §4 rules 1–2; #5758; Julian's rule on HAL-17946; the board on HAL-17912 (HAL-17927)

When the gate checks a pull request's approval, the plugin shall count only a signed "Liam: approved on head `<sha>`" (or "re-approved") line by the team account, or a GitHub approving review on the head that names Liam, that names the current head by at least its first 7 characters and was posted after the head commit and the last force-push, and shall ignore its own queue manager comments. A signed line shall count on any line of a comment, after any notes, only if the line is outside fenced code, not indented four spaces or a tab and not quoted, it is the comment's only approval line for that reviewer, and the comment holds no change request. A comment whose first line is the approval line shall not be read for change words, as the live Merger's gate reads it (HAL-19629).

## Examples

- Given "Liam: approved on head `<first 7 of head>`" posted after the last push,
  when a pass runs,
  then the pull request is enqueued.
- Given the same line posted before a force-push, naming another head, unsigned, or posted by another account,
  when a pass runs,
  then it isn't enqueued.
- Given a comment with two lines of notes and then "Julian: approved on head `<first 7 of head>`",
  when a pass runs,
  then it is enqueued; the same comment naming another head, the line quoted, in a code block, twice, or after "Julian: changes requested" doesn't count.
- Given Julian's comment on #6452 (26 Nov), "Julian: approved on head `<head>`" first and then "Findings, none blocking",
  when a pass runs,
  then it is enqueued; the same findings above the approval line void it.
