# paperclip.merge-watchers-unhandled

- Status: active
- Since: unreleased
- Source: HAL-17938, part 3 of HAL-17933; Chief's sync on HAL-16003 (24 Nov) and Chief's answers on HAL-17940

When a `pr-watch` pass has taken a company's GitHub snapshot, and an open pull request from a branch in its repository has had the same problem on the same head for 6 hours, the plugin shall report it once as UNHANDLED, in one comment per pass with every problem new in that pass, on the task in the `unhandledTask` setting, waking its holder. A problem is a red `ci-ok` on the head; a conflict while not in the merge queue; a required check with no run on the head; approved on the head, green, mergeable and not in the merge queue; an approval only on an older head; a red merge group; merge-group jobs waiting for a runner; or two exits from the merge queue without merging. A draft, and a pull request whose task is blocked with a blocker set, shall not be reported; a fixed problem or a new head starts the 6 hours over. It shall read only the snapshot, plugin state and the blocked tasks' blockers, send no GitHub request, and only log what it would write while `mergeWatchersDryRun` is on or the task is not set.

## Examples

- Given a pull request with a red `ci-ok`,
  when passes run at 0, 5 h 59 min, 6 h and 6 h 10 min, and after a push at 6 h 20 min and 12 h 20 min,
  then it is reported at 6 h and at 12 h 20 min only.
- Given a red `ci-ok` that turns pending at 5 h and red again at 5 h 10 min,
  when passes run until 11 h 10 min,
  then it is reported only at 11 h 10 min.
- Given a draft, a pull request whose task waits on a blocker, and one from a fork, all red,
  when passes run 6 h 40 min apart,
  then nothing is reported.
- Given `mergeWatchersDryRun` on,
  when a problem reaches 6 hours,
  then the plugin logs the report and writes nothing.
