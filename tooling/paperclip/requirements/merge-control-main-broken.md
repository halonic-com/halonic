# paperclip.merge-control-main-broken

- Status: active
- Since: unreleased
- Source: HAL-17884; Chief, HAL-17875, 24 Nov 22:20; the board, HAL-17912 item 3; the Merger's `pass.js`

When a merge group would hold its pull request as the culprit, every failed job's failure annotations name at least one file, and none of those files is one the pull request changes (all its changed files known), the plugin shall not hold the pull request, shall record main as broken with the run and the files once, and shall start the main-red freeze for `^revert\b` unless a freeze already holds; a failed job without file annotations shall keep the culprit hold, and the freeze's end shall clear the record.

## Examples

- Given the 24 Nov Leak guard failure on the files #5723 brought to main, blamed on #5762, with 12 other pull requests queued,
  when a pass runs,
  then main is recorded as broken, the freeze starts, nothing is held, commented or dequeued, and the 12 stay queued.
- Given a failed job with no file annotations, or a second job naming a file the pull request changes,
  when a pass runs,
  then the pull request is held as before.
- Given main recorded as broken,
  when a green push run on `main` ends the freeze,
  then the record is cleared.
