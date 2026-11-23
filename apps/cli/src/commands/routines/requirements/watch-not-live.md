# cli.commands.routines.watch-not-live

- Status: active
- Since: unreleased
- Source: HAL-16506 (C715 #8 on HAL-16498); the words of `cli.commands.routines.list-live-version`'s line under the list, team wording as HAL-2282 allows

When `halonic routines watch` starts and a routine it starts is on and has saved changes that aren't live yet, it shall print, before its "Watching" line, the line `halonic routines` gives under the list: "! Weekly report has changes that aren't live yet. It runs as last committed until you commit them or make them live in Halonic Studio.", or, when the routine's saved file has errors, "! Weekly report has changes that aren't live yet, with errors. It runs as last committed. See the errors with halonic validate." with the user's `--dir`. A routine that is off, or that the watch leaves out with its own ✕ line, and every routine of a workspace that keeps no history, shall get no such line.

## Examples

- Given Hourly follow-up live every hour, and its saved file changed to every 2 hours without a commit,
  when `halonic routines watch` is run,
  then it prints "! Hourly follow-up has changes that aren't live yet. It runs as last committed until you commit them or make them live in Halonic Studio." and "Watching 1 routine in Acme. Stop with Ctrl C.".
