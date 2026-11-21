# studio.workspace-runs

- Status: active
- Since: unreleased
- Source: HAL-1301 (T8 PR 3a, read side), HAL-6602 (where the desktop engine runs); states K5 (HAL-5896); a11y check Q4 (HAL-12905); HAL-13318 (T8 PR 3b, answers through the window's engine)

When the desktop app opens a folder, it shall give the Runs feature and the Inbox the folder's run logs, the ones the CLI writes, as their runs. The Runs list shall name each run's workflow, its steps and its hub from the workspace's files, which it shall read again after a file changed outside the app, and write money in the workspace's `budget.currency`. It shall give each model provider's kind (on this computer or elsewhere) and the `name` its file gives, so a run's banner names the provider as a person knows it. It shall give each hub's model aliases, with the workspace's name, provider files and each provider's host and port (from its `baseUrl`, or else a local server's default address), so a failed run's banner names the key, the alias and the agent from the same facts as the CLI (`app.run-failure`). While anything listens, the app shall read the runs again every 10 seconds and when the window comes to the front, and tell its listeners only when a run started, moved on or ended. A list that fails shall not stop the polls. An answer to a run (approve, reject or a wait step's own event) shall go to the window's own engine (`studio.engine-service`) with its payload and the tool call or wait step it answers, and the app shall then read the runs again, so the Inbox and the Runs list show the run moved on. Where no engine is given, answering a run shall fail as `unavailable` with the CLI line that answers it.

## Examples

- Given a run of Acme's `reply` workflow waiting at its `publish` call,
  then the Runs list holds it, names its workflow "Reply to a customer", and writes money in USD.
- Given the Runs list is open,
  when `halonic run` approves the call in a terminal and the window comes to the front,
  then the list hears that a run changed.
- Given the Runs list is open,
  when someone renames the workflow in its file,
  then the next list names it by the new name.
- Given the Inbox shows that run's call,
  when you approve it in the Studio,
  then the window's engine records the answer for that call, the run moves on, and the Inbox hears it.
- Given an answer for a call the run no longer waits on,
  when it is sent,
  then the engine refuses it and records nothing.
