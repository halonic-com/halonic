# studio.trust-review-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam; the wording decided by the team with Sofia on HAL-15017, on the approved trust review (the same words as `cli.trust-check-asks`)

When the trust review shows an agent whose trust content holds `asks: in-sandbox`, its row shall have a line labelled `Without asking` that says it edits and runs commands in its working folder, inside the sandbox. An agent without it shall get no such line. When the workspace changed since it was trusted and an agent's `asks` differs, the agent's Changed row shall have one line for it: `Now without asking` with what it now does, inside the sandbox, or `Asks again` before it edits or runs a command.

## Examples

- Given a new workspace with a Claude Code agent `coder` with `asks: in-sandbox`,
  then `coder`'s row has the line `Without asking: edits and runs commands in its working folder, inside the sandbox`.
- Given a Claude Code agent without `asks: in-sandbox`,
  then its row has no `Without asking` line.
- Given a trusted agent `coder` that turns `asks: in-sandbox` on,
  then its Changed row has `Now without asking: edits and runs commands in its working folder, inside the sandbox`;
  and when it turns it off again, `Asks again: before it edits or runs a command`.
