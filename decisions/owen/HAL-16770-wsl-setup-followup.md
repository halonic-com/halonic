# Decision: `--wsl-setup` checks every flag's path and says what `error` covers

- Approval: Paperclip task HAL-16770 (Liam's [minor] in the code review of #5413, Julian's findings in the security review on HAL-16821); Liam approves this note in review
- Kind: internal

The requirement for `--wsl-setup` landed with #5413 and isn't in a release yet. The reviews asked for three changes to it:

- `error` covers anything the setup throws, not only a saved state that can't be read: a `wsl.exe` that can't be started, and now a `RunOnce` key that `reg.exe` can't set. Before, a failed `reg add` was ignored, and the install went ahead with no way back after the restart.
- `--profile-folder` must be an absolute path without a `..` part, so the state file doesn't depend on the folder the shell started the host in.
- `--wsl-resume` must start with a quoted absolute path on a drive, so `RunOnce` never runs a bare program name found on `PATH`.

All three refuse more or fail louder; nothing that worked before is allowed less checking.

## Covers

- agent-host.wsl-setup-command
