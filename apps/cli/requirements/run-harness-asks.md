# cli.run-harness-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (`asks` only on Claude Code until Codex follows it)

If `halonic run <workflow> --harness <harness>` names a program other than Claude Code, and an agent of the run has `asks` in its file, then the command shall refuse before it checks the sandbox (`invalid_input`, exit 2), with nothing run and nothing written to the run log, saying that only Claude Code follows `asks`, and with the fix to run the agent in Claude Code or remove `asks` from its file. `halonic runs send` shall refuse the same for a run that recorded such a harness, with "Nothing was sent.". `--harness claude-code` and `--harness halonic` shall not be refused for it.

## Examples

- Given the Claude Code agent Writer with `asks: always` or `asks: in-sandbox`,
  when `halonic run support-reply --harness codex` runs,
  then it fails with exit 2, "Writer's file says when it asks before it acts, which only Claude Code follows, and this run starts it in another program. Nothing ran.", and the sandbox isn't checked.
- Given the same agent,
  when `--harness claude-code` or `--harness halonic` is given,
  then this check lets the run go on.
