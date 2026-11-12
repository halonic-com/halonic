# studio.workspace-runs

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8 PR 3a, read side), HAL-6602 (where the desktop engine runs); states K5 (HAL-5896)

When the desktop app opens a folder, it shall give the Runs feature and the Inbox the folder's run logs, the ones the CLI writes, as their runs. The Runs list shall name each run's workflow and its steps from the workspace's files, which it shall read again after a file changed outside the app, and write money in the workspace's `budget.currency`. It shall tell whether a run made a tool call from the run's log, read again only when the log grew. While anything listens, the app shall read the runs again every 10 seconds and when the window comes to the front, and tell its listeners only when a run started, moved on or ended. A list that fails shall not stop the polls. Until the window has an engine of its own, answering a run shall fail as `unavailable`.

## Examples

- Given a run of Acme's `reply` workflow waiting at its `publish` call,
  then the Runs list holds it, names its workflow "Reply to a customer", writes money in USD, and says it made a tool call.
- Given the Runs list is open,
  when `halonic run` approves the call in a terminal and the window comes to the front,
  then the list hears that a run changed.
- Given the Runs list is open,
  when someone renames the workflow in its file,
  then the next list names it by the new name.
- Given the Inbox shows that run's call,
  when you approve it in the Studio,
  then the answer fails as `unavailable` and the run keeps waiting.
