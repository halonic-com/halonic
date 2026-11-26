# paperclip.verdicts-shadow

- Status: active
- Since: unreleased
- Source: HAL-19481, steps 1 and 2 of 2.4 in the plan on HAL-19228 with Liam's changes from HAL-19325

While merge control runs in shadow mode and the board has named the reviewers' agents (`verdictReviewers`), the plugin shall compare, for each open pull request on a new head and every 15 minutes after, the gate's approval rules on GitHub text (`approvalOf` and `changeRequestOf`) with what the recorded verdicts say as the gate reads them once the board's flag is on (`recordedGateOf`, `paperclip.verdicts-gate`), and list in the daily shadow diff each pull request where they disagree, with both sides' reasons. It shall refuse nothing and change no gate.

When the gate's approval rules pass, before it reads the records, the plugin shall import each approval's Paperclip copy (0.1) as a record, once, only when:
- the reviewer's agent the settings name wrote it, from a run, and it isn't a receipt;
- it was never edited or deleted;
- it is on the task the branch names and names the current head by all 40 characters, with no rebase part;
- the same author check and HAL-14809 rules as `review_verdict` allow it.

The record keeps the comment's id. Records that can't be read count as `unknown`, never approved.

## Examples

- Given Liam's approval line on GitHub and his copy on the branch's task, written in his run and never edited,
  when merge control's pass checks the pull request,
  then the copy becomes Liam's approval record and the two sides agree.
- Given the same copy, edited after it was posted,
  when the pass checks it,
  then nothing is imported and the diff lists "gate: approved; records: not approved".
- Given a recorded approval and no approval line on GitHub,
  when the pass checks it,
  then the diff lists the pull request with the gate's reason.
