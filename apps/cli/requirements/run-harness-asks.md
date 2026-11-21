# cli.run-harness-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (`asks` only on Claude Code until Codex follows it); the wording decided by the team with Sofia on HAL-15017

If `halonic run <workflow> --harness <harness>` names a program other than Claude Code, and an agent of the run has `asks` in its file, then the command shall refuse before it checks the sandbox (`invalid_input`, exit 2), with nothing run and nothing written to the run log, saying that the agent's file uses `asks`, which only Claude Code follows, but the run starts it in the named program, and with the fix to start the run again without `--harness` and the program, so the agent runs in Claude Code, or remove `asks` from its file (HAL-15117). `halonic runs send` shall refuse the same for a run that recorded such a harness, with "Nothing was sent.". `--harness claude-code` and `--harness halonic` shall not be refused for it.

## Examples

- Given the Claude Code agent Writer with `asks: always` or `asks: in-sandbox`,
  when `halonic run support-reply --harness codex` runs,
  then it fails with exit 2, "Writer's file uses asks, which only Claude Code follows, but this run starts Writer in Codex. Nothing ran.", the fix "Start the run again without --harness codex, so Writer runs in Claude Code, or remove asks from Writer's file.", and the sandbox isn't checked.
- Given the same agent,
  when `--harness claude-code` or `--harness halonic` is given,
  then this check lets the run go on.
