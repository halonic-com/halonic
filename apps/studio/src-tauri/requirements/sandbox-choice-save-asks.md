# studio.src-tauri.sandbox-choice-save-asks

- Status: draft
- Since: unreleased
- Source: HAL-16342; continues `sandbox-choice-save`

When the page calls `agent_host_sandbox_choice_save` with `none`, the shell shall ask the person in its own native dialog, "Continue without a sandbox?", before it reads or writes the choice, and shall save `none` only when the person presses Continue without sandbox. When the person cancels or closes the dialog, or the platform has no dialog, the shell shall save nothing, stop no host and answer the host's choice as it was. The shell shall refuse an unknown backend as `invalid_choice` before it asks. A save of any other backend, or the removal of the choice, shall not ask. The dialog shall not hold the agent host while it waits.

## Examples

- Given `srt` saved,
  when the page saves `none` and the person presses Cancel in the shell's dialog,
  then the choice stays `srt` and the page gets the host's choice for `srt`.
- Given `srt` saved,
  when the page saves `none` and the person presses Continue without sandbox,
  then the shell saves `none` with the app's version.
- Given the page saves `srt-wsl`,
  then the shell saves it without asking.
