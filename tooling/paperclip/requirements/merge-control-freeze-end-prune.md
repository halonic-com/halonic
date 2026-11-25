# paperclip.merge-control-freeze-end-prune

- Status: active
- Since: unreleased
- Source: HAL-18066; the board's CI sweep on HAL-17912, items D and F (25 Nov); the Merger's `pass.js`

While the main-red freeze holds, the plugin shall end it, besides on a green push run (`paperclip.merge-control-main-red`), when the newest completed, not cancelled `CI` push run on `main` created after it began failed only in jobs on the settings' known-flaky list (jobs named `ci-ok…` and `Cancel the run…` not counted), or when a merge group created after it began passed, and shall log which of these ended it; any other red job, or red jobs that weren't read, shall keep the freeze. At the start of each pass, the plugin shall also drop every culprit hold and cooldown whose pull request isn't in the snapshot's list of open pull requests or is open on another head, and shall drop nothing when that list couldn't be read.

## Examples

- Given a freeze and a newer push run red only in `Android device keys (emulator)`, `ci-ok` and the cancel job,
  when a pass runs,
  then the freeze ends and the log says only known-flaky jobs failed.
- Given the same run with another job red too,
  when a pass runs,
  then the freeze holds.
- Given a freeze and a green merge group created after it began,
  when a pass runs,
  then the freeze ends and the log names the group; a green group created before it began changes nothing.
- Given holds and cooldowns for a merged, a closed and a rebased pull request, and one for a pull request still open on the same head,
  when a pass runs,
  then only the last one is kept; when the open list couldn't be read, all are kept.
