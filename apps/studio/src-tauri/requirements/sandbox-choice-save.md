# studio.src-tauri.sandbox-choice-save

- Status: draft
- Since: unreleased
- Source: HAL-13319 (continues HAL-10796); Liam's decision of 16 Nov on HAL-10796 (the shell writes the setting into the distro too); `SandboxChoiceHost` in `packages/studio/features/settings`

When the page calls `agent_host_sandbox_choice_save` with a backend, the shell shall refuse a backend that isn't one of the port's `SandboxBackend`s as `invalid_choice` before it reads or writes anything, and otherwise save it as the person's sandbox choice in the CLI's profile, with the time it was chosen and, for `none`, the app's version. Called with no backend, it shall remove the choice. The page shall never name a file or a folder. When the choice asks for the host in Halonic's WSL distro, the shell shall first make the distro's copy of the choice match it, through the distro's agent host, and when that copy can't be made it shall refuse the call as `host_unavailable` and save nothing. When the choice asks for another host than the one it asked for before, or the choice before couldn't be read, the shell shall stop the running host and end every stream on it. It shall then call the host's `POST /v1/sandbox/choice/settings-changed`, starting the host the choice asks for when none runs, and answer its status and body. Before it starts the host in the distro for any call, the shell shall make the distro's copy of the choice match the one in the profile, removing the copy when there is no choice, and refuse the start as `host_unavailable` when it can't.

## Examples

- Given the page calls `agent_host_sandbox_choice_save` with `docker`,
  then the shell refuses it as `invalid_choice` and the choice saved before stays.
- Given Windows and a running host in the distro,
  when the page saves `srt-wsl` and the distro's copy can't be written,
  then the shell refuses the call as `host_unavailable` and the choice in the profile stays as it was.
- Given Windows and a running host in the distro,
  when the page saves `srt`,
  then the shell saves the choice, stops the host in the distro and answers the local host's choice.
