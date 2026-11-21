# ports.harness-sign-in-command

- Status: active
- Since: unreleased
- Source: HAL-5649; the sign-in by hand of HAL-5395; the wording decided on HAL-5231; the agent's folder made first on HAL-15354

The ports shall give a harness's sign-in for one agent as a person types it into their own terminal: in PowerShell on Windows and in `sh` elsewhere. It shall first make the agent's settings folder when it isn't there, only the user's in `sh`, because an agent that never ran has none yet and a harness may refuse to sign in to a missing folder. It shall then set the harness's folder variable to that folder for that command only, and quote the folder so the shell expands nothing in it. Studio and `halonic doctor` shall both use it, so they show the same command.

## Examples

- Given Claude Code's sign-in and the folder `/data/agents/writer`,
  when it is written for `sh`,
  then it is `mkdir -p -m 700 '/data/agents/writer' && CLAUDE_CONFIG_DIR='/data/agents/writer' claude auth login`.
- Given Codex's sign-in and a folder that isn't there yet,
  when it is written for PowerShell,
  then it makes the folder with `New-Item -ItemType Directory -Force` before it sets `CODEX_HOME` and runs `codex login`.
- Given a folder with a `'` in it,
  when it is written for `sh` or PowerShell,
  then the quote is kept in each shell's own way.
- Given a folder with `$HOME` or `*` in it,
  when it is written for either shell,
  then the shell expands neither.
