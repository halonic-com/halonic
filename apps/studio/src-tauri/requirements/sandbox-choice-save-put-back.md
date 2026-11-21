# studio.src-tauri.sandbox-choice-save-put-back

- Status: draft
- Since: unreleased
- Source: HAL-14510 (Liam's security review of HAL-13319 on HAL-14121); continues `sandbox-choice-save`

When `agent_host_sandbox_choice_save` made the distro's copy of the choice match the new choice and then can't save the choice in the CLI's profile, the shell shall make the distro's copy match the choice the profile still holds, removing the copy when there is none, and refuse the call with the profile's error. When the copy can't be put back, the refusal shall say so too. When the choice before couldn't be read, the shell shall leave the distro's copy, since the next start of the host in the distro refuses on the unreadable choice.

## Examples

- Given Windows, `srt-wsl` saved and a profile that can't be written,
  when the page saves `none`,
  then the distro's copy names `srt-wsl` again and the shell refuses the call with the profile's error.
- Given the same, and `wsl.exe` failing after the first copy,
  then the shell refuses the call with the profile's error and says the distro's copy couldn't be put back.
