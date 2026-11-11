# app.run-proposal-done

- Status: active
- Since: 0.1.0
- Source: engine answer 2 on HAL-3267 (the ref is deleted when the proposal is done, or after 30 days); req-inbox `inbox.proposal.done`, `inbox.proposal.review`; Elena on HAL-4121 (the run's undo steps go) and HAL-4802 (CHECK 5); HAL-3248

When the person can no longer undo their last decision on a run's proposal (the toast has gone) and no file of it is left undecided, the proposal service shall settle it: delete the run's proposal ref, keep the decisions record marked as settled, and say so, so the run's steps leave the workspace's undo history. A file that may never be written shall count as decided for this. When a file is still undecided, it shall leave the proposal open and change nothing. When the run finished 30 days ago or more and its proposal is still open, the proposal service shall settle it as expired; files still undecided then were not reviewed. A settled proposal shall take no further Accept, Reject or Undo.

## Examples

- Given the person rejected all 3 files of run `01JD8Q`,
  when the toast has gone,
  then `refs/halonic/proposals/01JD8Q` is deleted, the record still says rejected for each file, and it is settled as decided.
- Given the person rejected all of run `01JD8Q` and pressed Undo before the toast went,
  when the toast has gone,
  then the proposal stays open, with its ref.
- Given the person accepted 2 files of run `01JD8Q` and the third may never be written,
  when the toast has gone,
  then the proposal is settled.
- Given run `01JD8Q` was settled,
  when an undo step of it comes back,
  then nothing is written.
- Given nobody decided run `01JD8Q`'s files for 30 days,
  when Halonic checks,
  then its ref is deleted, the files are still undecided, and the proposal is settled as expired.
- Given run `01JD8Q` finished 29 days ago,
  when Halonic checks,
  then its proposal stays open.
