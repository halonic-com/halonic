# fs-tauri.run-store

- Status: draft
- Since: 0.1.0
- Source: HAL-2701, HAL-191 (the `fs-tauri` run store); `FolderRunStore` in `fs-node`; `ports.run-log-files`; `RunStore` port v1

The Tauri run store shall implement `RunStore` by calling the shell's `run_append`, `run_events`, `run_snapshot` and `run_logs` commands, naming the run folder only by the workspace it was made for and its deployment, never by a path. It shall check appends and run ids, write events as log lines and read them back, and work out summaries with the `RunStore` port's rules, as `fs-node` does, and send the shell only whole lines and the snapshot as text. When the shell couldn't write a snapshot, the append shall still succeed and the store shall pass the shell's reason to `onSnapshotError`. It shall throw a `RangeError` when it is made for a deployment id that `isDeploymentId` in `@halonicjs/profile` refuses, since the id becomes a folder name, and the shell refusing a deployment id shall reject with an `internal` error. When the shell refuses a workspace that isn't open in it, the call shall reject with a `denied` error; an `io` refusal with an `unavailable` error that keeps the shell's message; a broken log with an `Error` holding the shell's message. A rejection that isn't the shell's refusal shape, or an answer that isn't the command's, shall reject with an `unavailable` error that doesn't repeat its text.

## Examples

- Given a store for `/workspaces/acme` and deployment `nightly`,
  when it appends events 1 and 2 with a snapshot,
  then the shell receives `run_append` with the workspace, the deployment, the events as log lines and the snapshot as JSON text.
- Given deployment `../nightly` or `con`,
  when a store is made for it,
  then it throws a `RangeError` and the shell receives nothing.
- Given a store for a workspace the person didn't open in the shell,
  when it appends,
  then it rejects with a `denied` error.
- Given a snapshot file that isn't a snapshot, or one ahead of the log,
  when the snapshot is read,
  then it is `null`.
- Given the served Studio, which has no capability for the run commands,
  when any method is called,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
