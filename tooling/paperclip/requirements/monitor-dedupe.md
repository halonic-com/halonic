# paperclip.monitor-dedupe

- Status: active
- Since: unreleased
- Source: HAL-20175 (follow-up to HAL-19370, verdict "tune": 3.2 monitor wakes per merged pull request counting the PR watcher's, goal at most 2); builds on `paperclip.pr-watcher-monitor-postpone`

While the setting `monitorDedupe` is `on` (its default), when the server asks the Agent tools plugin's `state-packet` data key before an `issue_monitor_due` run starts on a task with one or more pull requests on an `<agent>/HAL-<n>-<words>` branch that names it, the plugin shall keep, per task, the time of that check and the head commit and `ci-ok` of each of those pull requests that is open, read as the state packet reads them. Keeping it shall not change or delay the answer to the server.

When the PR watcher checks an open task whose author holds it and has no run going, one of whose pull requests is open, and whose Paperclip monitor is due within 1 hour from the start of the pass (the author's short check, which `paperclip.pr-watcher-monitor-postpone` leaves alone), the PR watcher shall move that monitor to 6 hours from the start of the pass when either:

- it wakes the author on the task in the same pass, so the monitor would be a second wake for the same pull request; or
- the task's open pull requests, none of them a draft, none with a failed `ci-ok` on its head and none with a review finding on its head, are the same ones with the same head commits and the same `ci-ok` as at the task's last kept check.

A failed `ci-ok` never counts as unchanged: when a check is re-run on the same head, the failed `ci-ok` stays the newest one until the re-run's jobs finish, and the watcher reports a red head only once, so the short check is then the author's only wake. A review finding never counts as unchanged either: the pending short check is what keeps a progress note from counting as an answer (`paperclip.pr-watcher-answered-review`).

For each move it shall log the task, the reason and the new time, starting `Monitor dedupe:`, and save as metrics `monitors.deduped`, `monitors.deduped_wake` or `monitors.deduped_unchanged`, tagged like the pass's other metrics; a refused move counts as `monitors.postpone_refused`, as for any other move. In a dry run it shall only log. With the setting `off`, or on a monitor already due, it shall leave the short check alone. For the second case only, it shall also leave it alone on a task with no kept check or with a draft among the open pull requests.

While the watcher runs, a moved check doesn't fire: a woken author has the watcher's wake, and an unchanged task has nothing new for the author; a later change, such as `ci-ok` turning green, hands the task to its reviewer (`paperclip.pr-watcher-handoff`).

## Examples

- Given HAL-4614, held by its author, with a failed `ci-ok` on #4614's head and a monitor due in 20 minutes,
  when the watcher runs,
  then it wakes the author, moves the monitor to 6 hours out and logs `Monitor dedupe: HAL-4614: the watcher wakes the author now; moved its monitor to …`.
- Given HAL-4605 with #4605 open on head `abc1234` and `ci-ok` pending, the same as at its check 20 minutes ago, and a monitor due in 15 minutes,
  when the watcher runs,
  then it moves the monitor to 6 hours out and counts 1 `monitors.deduped_unchanged`.
- Given the same task whose `ci-ok` turned green, or whose head changed, since that check,
  when the watcher runs,
  then it leaves the monitor alone.
- Given HAL-4605 whose `ci-ok` on head `abc1234` failed and was re-run, the same failed `ci-ok` as at its last check, or with a review finding on that head,
  when the watcher runs,
  then it leaves the monitor alone.
- Given the setting is `off`,
  when the watcher runs,
  then it leaves short checks alone and nothing is kept on monitor wakes.
