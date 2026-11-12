# ports.harness-sign-in-command

- Status: active
- Since: 0.1.0
- Source: HAL-5649; the sign-in by hand of HAL-5395; the wording decided on HAL-5231

The ports shall give a harness's sign-in for one agent as a person types it into their own terminal: in PowerShell on Windows and in `sh` elsewhere. It shall set the harness's folder variable to the agent's settings folder for that command only, and quote the folder so the shell expands nothing in it. Studio and `halonic doctor` shall both use it, so they show the same command.

## Examples

- Given Claude Code's sign-in and the folder `/data/agents/writer`,
  when it is written for `sh`,
  then it is `CLAUDE_CONFIG_DIR='/data/agents/writer' claude auth login`.
- Given a folder with a `'` in it,
  when it is written for `sh` or PowerShell,
  then the quote is kept in each shell's own way.
- Given a folder with `$HOME` or `*` in it,
  when it is written for either shell,
  then the shell expands neither.
