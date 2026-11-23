# paperclip.pr-watcher-monitor-postpone

- Status: active
- Since: unreleased
- Source: HAL-16401 part 3; option A of its core-change write-up, which Liam chose on HAL-16413; the host method from the local server patch (halonic-com/server#18, live since 23 Nov)

When the PR watcher checks an open task whose author holds it and has no run going, one of whose pull requests is open, and whose Paperclip monitor is due between 1 and 5 hours from the start of the pass, the PR watcher shall ask Paperclip to move that monitor to 6 hours from the start of the pass, and shall save as metrics, tagged like the pass's other metrics, how many monitors it moved or would move (`monitors.postponed`) and how many moves Paperclip refused (`monitors.postpone_refused`).

The watcher shall leave a monitor alone that is due within 1 hour, because that is the author's own check of CI after a push, which the watcher doesn't replace; and shall leave the monitor alone on a task whose pull requests are all closed, on a task it marks done, and on a task the reviewer holds. A refused move shall be logged and counted, and shall not count the task as one it couldn't check. In a dry run it shall only log the move.

While the watcher runs, a fallback monitor thus stays 5 to 6 hours out and doesn't fire a model run; if the watcher stops, it fires within 6 hours, as before.

## Examples

- Given HAL-4605, held by its author, with an open pull request and a monitor due in 3 hours,
  when the watcher runs,
  then it moves the monitor to 6 hours from the start of the pass and counts 1 moved.
- Given the same task with a monitor due in 20 minutes, in 5 and a half hours, or no monitor,
  when the watcher runs,
  then it moves nothing.
- Given HAL-4485, whose pull request merged with a green `ci-ok`, and a monitor due in 3 hours,
  when the watcher runs,
  then it marks the task done and moves nothing.
- Given HAL-4605 held by Liam, the reviewer, on Mateo's branch,
  when the watcher runs,
  then it moves nothing.
- Given Paperclip refuses the move,
  when the watcher runs,
  then it logs why, counts 1 refused, and lists no task as failed.
- Given a dry run,
  when the watcher runs,
  then it counts 1 moved, logs the move and asks Paperclip for nothing.
