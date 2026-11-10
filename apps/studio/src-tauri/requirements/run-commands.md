# studio.src-tauri.run-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-2701; `runsFolder` in `@halonicjs/profile`; `runCommands` in `packages/adapters/fs-tauri`

When the page calls a `run_*` command for a workspace, the shell shall keep the runs in the run folder `runsFolder` in `@halonicjs/profile` names for the workspace's real path, in the CLI's profile, and never in a folder the page names. If the workspace is not a folder the person opened in the shell, nor inside one, then the shell shall refuse the call as `folder_not_open` without reading or writing anything. If the deployment id is not one `deployments.yaml` allows, then the shell shall refuse the call as `invalid_deployment`. When an append has stored its lines, the shell shall answer that it appended, also when the snapshot or the release of the run's lock failed afterwards.

## Examples

- Given the opened folder `acme`,
  when the page calls `run_logs` for `acme/sub/..`,
  then the shell reads `<profile>/workspaces/<key of acme>/runs`.
- Given the opened folder `acme`,
  when the page calls `run_events` for `acme` and the deployment `nightly`,
  then the shell reads `<profile>/workspaces/<key of acme>/deployments/nightly/runs`.
- Given no opened folder,
  when the page calls `run_append` for `acme`,
  then it is refused as `folder_not_open`.
- Given the opened folder `acme`,
  when the page calls `run_logs` for the deployment `../other`,
  then it is refused as `invalid_deployment`.
- Given an append whose lines are stored but whose snapshot can't be written and whose lock can't be released,
  when the shell answers,
  then the answer is `{ "ok": true, "lastSeq": 2, "snapshotError": "…" }`, and the lock's error is logged.
