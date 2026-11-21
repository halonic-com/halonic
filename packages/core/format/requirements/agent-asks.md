# format.agent-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (found by the HAL-12475 smoke run)

When `parseFile` reads an agent file, the format shall accept an optional `asks` field, `always` or `in-sandbox`, and leave it out when the file does, so older files read as before. Any other value shall fail at `asks`. If the agent's harness isn't `claude-code` (it is `codex`, `halonic`, or left out), then a file with `asks`, either value, shall fail with `asks-needs-claude-code` at `asks`, with a message that names the agent's harness and says to remove `asks` or set `harness: claude-code`.

## Examples

- Given a Claude Code agent without `asks`, when it is parsed, then it has no `asks`.
- Given a Claude Code agent with `asks: always` or `asks: in-sandbox`, when it is parsed, then `asks` holds that value.
- Given `asks: never`, when it is parsed, then it fails with `invalid_value` at `asks`.
- Given an agent with `harness: codex`, `harness: halonic` or no harness, and `asks: always` or `asks: in-sandbox`, when it is parsed, then it fails with `asks-needs-claude-code` at `asks`.
