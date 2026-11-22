# check.ci-desktop-hourly

- Status: active
- Since: unreleased
- Source: HAL-15889 (board decision, 22 Nov)

The `.github/workflows/ci.yml` workflow shall run the macOS and Windows set (the jobs that skip in merge groups) hourly and on a manual start, on the newest `main`, and skip its Linux jobs there; a push to `main` shall not run that set itself, and the `.github/workflows/desktop-hourly.yml` workflow shall start it by hand from a push to `main` when no scheduled or manual run started in the last hour and none is waiting or running. No run of it shall cancel another that is in progress, and pull requests and merge groups shall run as before.

## Examples

- Given the hour passes :05,
  when CI starts on `main`,
  then every macOS and Windows job runs, with the WSL runtime the Windows installer needs, and the Linux jobs skip.
- Given an hourly run still in progress,
  when the next one starts,
  then it waits, and the one in progress runs to the end.
- Given a push to `main`,
  when CI runs,
  then no macOS or Windows job starts, and the agent host builds on Linux only.
- Given a pull request,
  when CI runs,
  then the macOS and Windows jobs run as before, and the agent host builds on all three systems.
- Given no scheduled or manual run on `main` in the last hour,
  when a push lands on `main`,
  then the push starts the macOS and Windows set by hand, and the next push within the hour doesn't start another.
