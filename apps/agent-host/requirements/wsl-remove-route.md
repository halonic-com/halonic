# agent-host.wsl-remove-route

- Status: active
- Since: 0.1.0
- Source: HAL-10974 (S1), HAL-5402; `sandbox-srt.wsl-remove`

When Studio asks to remove the WSL setup, the agent host shall take only the user's explicit choice, either `export-then-remove` with a backup file or `remove-only` without one, and shall refuse any other body, a backup file with `remove-only`, and no backup file with `export-then-remove`. It shall answer 202 at once and run the removal as the one setup job that may run at a time: it answers 409 `sandbox_busy` while a setup or the sandbox's own removal runs, and 409 `sandbox_in_use` while a sandboxed run goes on. The host shall build the removal itself from its profile and shall take nothing about the distro from the caller. It shall serve the route only with a profile folder and only outside Halonic's distro. A saved WSL state that can't be read shall end the job as a failure, never as an empty state.

## Examples

- Given `{ "choice": "export-then-remove" }` with the backup file the user picked,
  when Studio posts it,
  then the answer is 202 and the removal runs with that file.
- Given `{ "choice": "remove-only" }` and also a backup file,
  then the answer is 400 and nothing runs.
- Given an export that fails,
  then the job ends as `failed` with `export-failed` and the distro is not unregistered.
- Given a removal that runs,
  when Studio posts it again,
  then it joins the one that runs.
- Given a setup that runs,
  then the answer is 409 `sandbox_busy`.
