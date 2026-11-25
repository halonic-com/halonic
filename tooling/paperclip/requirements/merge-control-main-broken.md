# paperclip.merge-control-main-broken

- Status: active
- Since: unreleased
- Source: HAL-17884; HAL-18287 (stacked groups, #5969/#5994); HAL-18306 (any group, only on a red `main`); Chief, HAL-17875, 24 Nov 22:20; the board, HAL-17912 item 3; the Merger's `pass.js`

When a merge group would hold its pull request as the culprit, every failed job's failure annotations name at least one file, and none of those files is one the pull request or a pull request ahead of it in the group chain changes (each group's base commit followed back to a commit that is no group's head; all their changed files known), the plugin shall not hold the pull request, shall record main as broken with the run and the files once, and shall start the main-red freeze for `^revert\b` unless a freeze already holds, but only when `main`'s newest finished push run is red; any group, stacked or directly on `main`'s tip, with `main`'s newest finished push run green or not read shall instead log `main-broken suspected, not frozen (main push <sha> green)` once and keep the culprit hold. When a named file is one a pull request ahead of it changes, the plugin shall hold that pull request instead, once it is out of the queue. A failed job without file annotations, or a pull request in the chain with more changed files than were read, shall keep the culprit hold, and the freeze's end shall clear the record.

## Examples

- Given the 24 Nov Leak guard failure on the files #5723 brought to main, blamed on #5762, with 12 other pull requests queued,
  when a pass runs with `main`'s newest push run red,
  then main is recorded as broken, the freeze starts, nothing is held, commented or dequeued, and the 12 stay queued.
- Given a failed job with no file annotations, or a second job naming a file the pull request changes,
  when a pass runs,
  then the pull request is held as before.
- Given main recorded as broken,
  when a green push run on `main` ends the freeze,
  then the record is cleared.
- Given #5994's group built on #5969's failed group, failing on a file #5969 changes,
  when a pass runs,
  then #5969 is held, #5994 isn't, and nothing is frozen.
- Given a group, directly on `main`'s tip or stacked, that no pull request in its chain explains,
  when a pass runs with `main`'s newest push run green,
  then the suspected line is logged once, the group's own pull request is held and nothing is frozen;
  with that push run not read, the same; with it red, main is recorded as broken and the freeze starts.
