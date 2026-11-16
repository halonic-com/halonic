# sandbox-srt.wsl-remove

- Status: active
- Since: 0.1.0
- Source: HAL-5402, HAL-5407 (W12, W8)

The sandbox-srt adapter shall remove the `srt-wsl` setup ("Remove sandbox setup") only after an explicit choice that says what happens to the distro's files: keep it, export then remove, or remove after the export was offered and turned down. It shall never run `wsl --unregister` for any other input. When an export is asked for it shall run `wsl --export` first, to a Windows drive path, and leave the distro in place when the export fails. It shall unregister only a distro that Halonic recorded as its own import, and only when it is registered. After a successful removal it shall reset the saved setup state.

## Examples

- Given the recorded distro `halonic` and the choice export then remove to a file on a drive,
  when the setup is removed,
  then `wsl --export` runs, then `wsl --unregister`, and the saved state is `not-started`.
- Given an export that fails,
  when the setup is removed with an export,
  then the distro is still registered and the result is `export-failed`.
- Given a distro called `halonic` that Halonic didn't import,
  when removal is chosen,
  then nothing is changed and the result is `distro-not-ours`.
