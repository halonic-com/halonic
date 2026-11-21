# cli.run-harness-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (`asks` only on Claude Code until Codex follows it); the wording decided by the team with Sofia on HAL-15017; HAL-15288 (Codex follows `asks`, so the refusal is gone)

When `halonic run <workflow> --harness <harness>` names Claude Code or Codex, and an agent of the run has `asks` in its file, the command shall not refuse the run for it, because both programs follow `asks`; the run goes on to check the sandbox as any other. `halonic runs send` shall not refuse a run that recorded such a harness for it either.

## Examples

- Given the Claude Code agent Writer with `asks: always` or `asks: in-sandbox`,
  when `halonic run support-reply --harness codex` runs,
  then the run goes on to check the sandbox.
- Given the same agent,
  when `--harness claude-code` or `--harness halonic` is given,
  then this check lets the run go on.
