# studio.workspace-proposal-runs-once

- Status: active
- Since: unreleased
- Source: HAL-10916 (Liam's review of #5040: each load read the runs twice); `studio.workspace-run-proposals`, `studio.workspace-done-proposals`

When the Inbox asks the open workspace for its open and its done run proposals at the same time, Studio shall ask the agent host for both lists together and read the workspace's runs once for both, and not at all when neither list has a proposal. When one of the two lists fails, the other shall still come with its runs' records, and the failing one shall go on to the Inbox. A later ask shall read the host and the runs again.

## Examples

- Given a workspace with an open proposal of run `01JD8Q` and a done one,
  when the Inbox loads,
  then the runs are read once, and both proposals come with run `01JD8Q`'s record.
- Given a host whose Done list fails,
  when the Inbox loads,
  then the open proposals still come with their runs' records, and the Done list's failure goes to the Inbox.
