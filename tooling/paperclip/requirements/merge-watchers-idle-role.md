# paperclip.merge-watchers-idle-role

- Status: active
- Since: unreleased
- Source: the board's decision of 26 Nov on HAL-18422, built on HAL-19641: a reviewer went live and got almost no work for hours, and nobody noticed

When a `pr-watch` pass runs, for each agent that covers a role by the shared reviewer source (`personFor` in `routing.ts`, the same answer `pr_status` gives) and is live (status `active`, `idle`, `running` or `error`), the plugin shall count from the first pass that saw it live in that role, and, when 60 minutes have passed with no open task assigned to it and no run begun since then that left it out of `error`, report it once, with its roles and how long it waited, as a comment on the task in the `unhandledTask` setting, waking that task's holder (Chief), and as a comment on the task in the `boardLineTask` setting. An agent that got such work is never reported for that time live; one that is paused, stops covering a role or leaves the list starts the count again the next time a pass sees it live in a role. It shall keep no list of reviewers of its own, send no GitHub request, and only log what it would write while `mergeWatchersDryRun` is on or `unhandledTask` is not set.

## Examples

- Given Nora live as the routine reviewer with no task and no run,
  when passes run at 0, 61 and 70 minutes,
  then the pass at 61 minutes reports her once on Chief's chat, waking Chief, and on the board line, and the pass at 70 says nothing.
- Given the same, but Nora holds a task at 30 minutes, or her run began at 30 minutes and she isn't in `error`,
  then nothing is reported.
- Given Nora paused after she was reported, then live again,
  when an hour passes with no work,
  then she is reported again.
