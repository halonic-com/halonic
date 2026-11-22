# check.ci-pr-areas

- Status: active
- Since: unreleased
- Source: HAL-15970 (board decision, 22 Nov)

When `.github/workflows/ci.yml` runs on a pull request, the `changes` job shall pick the area jobs from the files the pull request changes against the `main` it is merged into, never from what `main` merged since the pull request's base; and the Windows installer, Windows update and WSL runtime jobs shall run only when the `installer` area changes: the installer's own build and what it ships, the Tauri shell's updater and agent-host code, the agent host's build, and the workflow.

## Examples

- Given a pull request that changes only a Studio feature's `vitest.config.ts`, while `main` has since merged a change to `apps/agent-host/src/` and `apps/studio/src-tauri/windows/`,
  when CI runs on it,
  then the Studio area is on and the agent host, Tauri and installer areas are off.
- Given a pull request that changes `apps/studio/src-tauri/windows/installer.nsi` or `apps/studio/src-tauri/src/updates_check.rs`,
  when CI runs on it,
  then the installer area is on and the Windows installer and Windows update jobs run.
- Given a pull request that changes only `apps/agent-host/src/` or a Tauri crate other than the updater's and the agent host's,
  when CI runs on it,
  then the installer area is off; the agent host and Tauri jobs still run for it.
- Given a push to `main` or the hourly run there,
  when CI runs,
  then every area is on and the Windows installer and Windows update jobs run whatever changed.
