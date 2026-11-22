# studio.trust-review-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam; the wording decided by the team with Sofia on HAL-15017, on the approved trust review (the same words as `cli.trust-check-asks`); said as what will happen until something answers the calls, the Agents section open and the changed line's label, from Iris's flow check C544 (HAL-15117); "this version of Halonic", from words check C571 (HAL-15401); the "still asks first" dropped once a fenced Studio run's agent host answers the calls, from claims check C616 (HAL-15702)

When the trust review shows an agent whose trust content holds `asks: in-sandbox`, its row shall have a line labelled `Without asking` that says it will edit and run commands in its working folder, inside the sandbox, the same words as the CLI's trust check (`cli.trust-check-asks`); a fenced Studio run's agent host answers those calls without a person (requirement `agent-host.sandboxed-asks`). The Agents section shall start open. An agent without it shall get no such line. When the workspace changed since it was trusted and an agent's `asks` differs, the agent's Changed row shall have one line for it: `Without asking` with the same words, or `Asks again` before it edits or runs a command.

## Examples

- Given a new workspace with a Claude Code agent `coder` with `asks: in-sandbox`,
  then `coder`'s row has the line `Without asking: will edit and run commands in its working folder, inside the sandbox`, and the Agents section starts open.
- Given a Claude Code agent without `asks: in-sandbox`,
  then its row has no `Without asking` line.
- Given a trusted agent `coder` that turns `asks: in-sandbox` on,
  then its Changed row has `Without asking: will edit and run commands in its working folder, inside the sandbox`;
  and when it turns it off again, `Asks again: before it edits or runs a command`.
