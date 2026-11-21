# cli.commands.routines.list-live-version

- Status: active
- Since: unreleased
- Source: HAL-15479 (C581 on HAL-15468, the CLI side of RT5); `app.routine-list-live-schedule`; `studio.workspace-routines-live-schedule`; `cli.commands.routines.list` (HAL-15204) for the line under the list and for git that can't start

The `halonic routines` command, and `halonic routines list` the same way, shall list a routine whose saved file isn't live yet as `halonic routines watch` runs it: its trigger in words, its Next column and its `--json` `nextRun` and `timeZone` from the workspace's live version, and its name and whether it is on from its saved file. It shall still get the line under the list that says its changes aren't live yet. A routine that is live or has never been live, and every routine of a workspace that keeps no history, shall be listed from its saved file. When git can't start, every routine shall be listed from its saved file, as `cli.commands.routines.list` says.

## Examples

- Given Weekly report with the schedule `0 9 * * 1` in the latest commit, and its saved file changed to `0 9 * * 0` without a commit, on Tuesday 10 Nov 2026,
  when `halonic routines` is run,
  then it prints "Weekly report   Mondays at 09:00   Next 16 Nov 09:00   Never ran", then "! Weekly report has changes that aren't live yet. It runs as last committed until you commit them.", and with `--json` its `nextRun` is `2026-11-16T09:00:00.000Z`.
- Given Weekly report with the schedule `0 9 * * 0` in a saved file no commit has,
  when `halonic routines` is run,
  then it prints "Weekly report   Sundays at 09:00   Next 15 Nov 09:00   Never ran".
