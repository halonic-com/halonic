# paperclip.merge-watchers-reviewer-wake

- Status: active
- Since: unreleased
- Source: HAL-17938, part 3 of HAL-17933; Chief's sync on HAL-16003 (24 Nov) and Chief's answers on HAL-17940; the shared reviewer since HAL-19653

When a `pr-watch` pass has taken a company's GitHub snapshot, and an open pull request on the watcher's first repository, from a branch in that repository, is out of draft, has a green `ci-ok` on its head, is mergeable, is not in the merge queue and has no signed approval on its head, and the passes have seen it so on the same head for 60 minutes (30 for one labelled `fast-track`), the plugin shall wake its reviewer once per head, the reviewer the snapshot names for it (`paperclip.snapshot-reviewer`): Liam on the task in the `liamWakeTask` setting, Julian on the task in `julianWakeTask`, Nora on the task in `noraWakeTask`, with one comment per reviewer listing every such pull request of that pass, its head and its wait. It shall read only the snapshot and plugin state, send no GitHub request, and only log what it would write while `mergeWatchersDryRun` is on or the task is not set.

## Examples

- Given a pull request waiting only for Liam's review,
  when passes run at 0, 59, 60 and 70 minutes, and after a push at 80 and 140 minutes,
  then Liam is woken at 60 and at 140 minutes, and at no other pass.
- Given one such pull request on a `liam/` branch and two on others,
  when a pass runs after 61 minutes,
  then Julian is woken once for the first and Liam once for the other two.
- Given a routine pull request the snapshot names Nora for, waiting only for her review,
  when a pass runs after 61 minutes,
  then Nora is woken on `noraWakeTask`, and Liam isn't.
- Given a draft, a red or running `ci-ok`, a conflict, a queued one, one approved on its head or one from a fork,
  when passes run 2 hours apart,
  then nobody is woken.
- Given `mergeWatchersDryRun` on,
  when a wake is due,
  then the plugin logs it and writes nothing.
