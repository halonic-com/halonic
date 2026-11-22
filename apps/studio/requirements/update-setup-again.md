# studio.update-setup-again

- Status: active
- Since: unreleased
- Source: HAL-5404 (update pre-flight, plan-pr2 part A, with Liam's conditions); design HAL-3779 section 4

When the update it installs has a `halonic.srtWindowsSetupVersion` in `latest.json` higher than the setup version this build's srt needs (`packages/adapters/sandbox-srt/windows-setup-version.json`), the shell on Windows shall say so in the updater's status as `sandboxSetupAgain` and pass `/SANDBOX=again` to the installer; a missing or unreadable number shall count as not higher. Since `latest.json` isn't signed, the installer shall decide by itself: given `/SANDBOX=again` in an update, it shall run its sandbox step, with its one administrator prompt, only when srt's marker on the computer (`MarkerVersion` under srt's machine key) is lower than the setup version its own srt needs, and shall not ask where no sandbox is set up, where the marker is already that version or newer, where the marker can't be read, or in a silent update without administrator rights. It shall read the marker without running a program from the install folder.

## Examples

- Given a `latest.json` whose setup version is higher than this build's,
  when the shell installs that update,
  then it passes `/SANDBOX=again` to the installer.
- Given `/SANDBOX=again` and srt's marker at 2 for an installer whose srt needs 3,
  when the update starts,
  then the sandbox step runs.
- Given `/SANDBOX=again` and srt's marker already at 3 for an installer whose srt needs 3,
  when the update starts,
  then the sandbox step doesn't run and no prompt shows.
- Given `/SANDBOX=again` and no sandbox set up on the computer,
  when the update starts,
  then the sandbox step doesn't run.
