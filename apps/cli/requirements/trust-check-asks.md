# cli.trust-check-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam; the wording decided by the team with Sofia on HAL-15017, on the approved trust check; said as what will happen until something answers the calls, from Iris's flow check C544 (HAL-15117)

When the trust check shows an agent whose trust content holds `asks: in-sandbox`, it shall add a line under the agent's row, labelled `Without asking`, that says it will edit and run commands in its working folder, inside the sandbox, and that this version still asks first, since nothing answers its calls yet (HAL-15117). An agent without it shall get no such line. When the workspace changed since it was trusted and an agent's `asks` differs, the check shall show one Changed row for it: that the agent will edit and run commands in its working folder without asking, inside the sandbox, and that this version still asks first, or that it asks again before it edits or runs a command.

## Examples

- Given a new workspace with a Claude Code agent `coder` with `asks: in-sandbox`,
  then under `coder`'s row the check shows `Without asking   will edit and run commands in its working folder, inside the sandbox; this version still asks first`.
- Given a Claude Code agent without `asks: in-sandbox`,
  then its row has no `Without asking` line.
- Given a trusted agent `coder` that turns `asks: in-sandbox` on,
  then the check shows `coder   will edit and run commands in its working folder without asking, inside the sandbox; this version still asks first   Changed`;
  and when it turns it off again, `coder   asks again before it edits or runs a command   Changed`.
