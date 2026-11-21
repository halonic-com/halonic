# Decision: the Windows installer refuses to go back across a raise of srt's setup version

- Approval: the task asks for this change (HAL-5404, condition S3 from the HAL-5407 review); refusing rather than running `windows-uninstall` is Owen's call on HAL-14806; Liam approved the plan (plan-s3) on HAL-5404 and approves this note in review there
- Kind: user-visible

## What changes

Every Windows installer now keeps, beside its kept copy in `updates\installers`, the Windows setup version its srt needs (`Halonic-<version>.srt-setup`, from `packages/adapters/sandbox-srt/windows-setup-version.json`; the build refuses to pack without a whole number). The shell removes the records of other versions with their installers. A new script, `setup-guard.ps1`, compares a setup version with the one the computer's sandbox was set up with. It exits 0 (go on), 1 (refuse) or 2 (can't tell).

- **An update that didn't prove it starts** runs the guard with the version before's record just before it would go back. Only 0 goes back. Otherwise the newer version stays, and `updates.log` says why and that going back means uninstalling (which removes the sandbox) and installing the older version again.
- **An installer** runs the guard with its own setup version before any page. On 1 it stops: a message box with pages, exit code 2 silent or passive. On 2 it goes on and writes a line in `updates.log`.
- A kept installer without a record is from a version before this one and counts as 3. **Correction to the design's premise:** v0.1.0 pinned srt 0.0.81, not 0.0.82; 0.0.81's own README describes the same raise from 2 to 3, so it is setup version 3 too.

New requirement `studio.installer-rollback-guard`. `sandbox-srt.windows-setup-version` gains two sentences: the registry value the guard reads matches what `srt-win` reports (fence test on the `sandbox-windows` job), and the recorded setup version stays at 3 or lower until a release with this guard has shipped. Its unit test fails above 3 and names this note.

## Why

An older srt can't undo a newer srt's setup or the grants it kept (srt's README, "Going back to an earlier release"). Running `windows-uninstall` before going back would need an administrator prompt nobody is waiting for, so the guard refuses instead (Owen, HAL-14806).

**Change from the approved plan:** the guard reads `MarkerVersion` from srt's machine key (`HKLM\SOFTWARE\sandbox-runtime`, 64-bit view, readable by all users) instead of running `srt-win user status`. Liam's condition 1 was not to run the user-writable `srt-win.exe` with administrator rights. The CI runners are elevated, so skipping the guard there would have stopped the update job's real go-back from going back. Reading the registry runs no program at all, with or without administrator rights, so the guard needs no elevated special case. It reads only that value (condition 2) and runs from the installer's own plugins folder with `-NoProfile -ExecutionPolicy Bypass -File`. The fence test holds the registry value to `srt-win`'s `marker_version` for every srt bump.

**The first raise past 3 must land after a release with this guard**, because installers before it go back unchecked. The unit test from #4256 enforces it (condition 3).

## Covers

- sandbox-srt.windows-setup-version
- .github/
