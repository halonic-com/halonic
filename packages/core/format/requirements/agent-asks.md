# format.agent-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (found by the HAL-12475 smoke run); HAL-15288 (Codex honours `asks`)

When `parseFile` reads an agent file, the format shall accept an optional `asks` field, `always` or `in-sandbox`, and leave it out when the file does, so older files read as before. Any other value shall fail at `asks`. If the agent's harness is neither `claude-code` nor `codex` (it is `halonic`, or left out), then a file with `asks`, either value, shall fail with `asks-needs-a-program-harness` at `asks`, with a message that names the agent's harness and says to remove `asks` or set `harness: claude-code` or `harness: codex`.

## Examples

- Given a Claude Code agent without `asks`, when it is parsed, then it has no `asks`.
- Given a Claude Code or Codex agent with `asks: always` or `asks: in-sandbox`, when it is parsed, then `asks` holds that value.
- Given `asks: never`, when it is parsed, then it fails with `invalid_value` at `asks`.
- Given an agent with `harness: halonic` or no harness, and `asks: always` or `asks: in-sandbox`, when it is parsed, then it fails with `asks-needs-a-program-harness` at `asks`.
