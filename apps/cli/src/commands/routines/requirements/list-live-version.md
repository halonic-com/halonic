# cli.commands.routines.list-live-version

- Status: active
- Since: unreleased
- Source: HAL-15479 (C581 on HAL-15468, the CLI side of RT5); a routine never live and saved changes with errors, HAL-15664 (C610 #1–2), a fix saved but not committed, and Studio's Make live after commit, HAL-15863 (C642 #2, #7), in the words of the Studio's routine page (`routines.page.frame-and-states`), team wording as HAL-2282 allows; `app.routine-list-live-schedule`; `studio.workspace-routines-live-schedule`; `cli.commands.routines.list` (HAL-15204) for the line under the list and for git that can't start; the line for changes with errors in C641's words (HAL-15867)

The `halonic routines` command, and `halonic routines list` the same way, shall list a routine whose saved file isn't live yet as `halonic routines watch` runs it: its trigger in words, its Next column and its `--json` `nextRun` and `timeZone` from the workspace's live version, and its name and whether it is on from its saved file. Its "Can't start" and the exit code shall follow the live version's errors, since that is what the watch starts. It shall still get the line under the list that says its changes aren't live yet; when its saved file has errors, that line shall say so and name `halonic validate` instead: "! Minute ping has changes that aren't live yet, with errors. It runs as last committed. See the errors with halonic validate." When its live version has errors and its saved file has none, the fix isn't committed yet: it shall be counted on its own first line, "! 1 routine can't start until its fix is committed", not under `halonic validate`, which reads the saved file, and the line under the list shall say "! Minute ping's fix isn't live yet, so it can't start. To start it, commit the fix or make it live in Halonic Studio." A routine that has never been live, in a workspace with history, shall be listed from its saved file, but the watch doesn't run it, so when it is on and has no errors its Next column shall say "Not live yet", its `--json` `nextRun` shall be `null`, and a line under the list shall say, in the Studio's words: "! Hourly ping isn't live yet, so it doesn't run. To start it, commit it or make it live in Halonic Studio." With `--json`, each routine shall give its `liveState` (`live`, `not-live` or `never-live`) and `savedProblems`, the errors of its saved file. A routine that is live, and every routine of a workspace that keeps no history, shall be listed from its saved file. When git can't start, every routine shall be listed from its saved file, as `cli.commands.routines.list` says.

## Examples

- Given Weekly report with the schedule `0 9 * * 1` in the latest commit, and its saved file changed to `0 9 * * 0` without a commit, on Tuesday 10 Nov 2026,
  when `halonic routines` is run,
  then it prints "Weekly report   Mondays at 09:00   Next 16 Nov 09:00   Never ran", then "! Weekly report has changes that aren't live yet. It runs as last committed until you commit them or make them live in Halonic Studio.", and with `--json` its `nextRun` is `2026-11-16T09:00:00.000Z`.
- Given Weekly report with the schedule `0 9 * * 0` in a saved file no commit has,
  when `halonic routines` is run,
  then it prints "Weekly report   Sundays at 09:00   Not live yet   Never ran", then "! Weekly report isn't live yet, so it doesn't run. To start it, commit it or make it live in Halonic Studio.", and with `--json` its `nextRun` is `null`.
- Given Weekly report starting Support reply in the latest commit, and its saved file changed to start `support-reply-typo`, which the hub doesn't have, without a commit,
  when `halonic routines` is run,
  then it prints "Weekly report   Mondays at 09:00   Next 16 Nov 09:00   Never ran", then "! Weekly report has changes that aren't live yet, with errors. It runs as last committed. See the errors with halonic validate.", and exits 0.
- Given Weekly report committed starting `support-reply-typo`, which the hub doesn't have, and its saved file fixed to start Support reply without a commit,
  when `halonic routines` is run,
  then it prints "! 1 routine can't start until its fix is committed", then "Weekly report   Mondays at 09:00   ✕ Can't start   Never ran", then "! Weekly report's fix isn't live yet, so it can't start. To start it, commit the fix or make it live in Halonic Studio.", and exits 1.
