# harness-host.history-off

- Status: active
- Since: 0.1.0
- Source: HAL-6277 (plan approved by Liam in HAL-6487)

While the host has no run copies, the proposal folders shall refuse a run that reads the saved files, or whose start names no version, when its folder opens, before the run starts, with a `ProposalsNeedHistoryError` that names the run and says how to turn history on. A run at a live version, and any run on a host with run copies, shall open as the proposal folders open it.

## Examples

- Given a host without run copies,
  when a run that reads the saved files starts,
  then its folder doesn't open and the error says to run git init and commit the workspace's files.
- Given a host without run copies,
  when a run at a live version starts,
  then its folder opens.
