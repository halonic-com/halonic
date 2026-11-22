# cli.trust-check-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam; the wording decided by the team with Sofia on HAL-15017, on the approved trust check; said as what will happen until something answers the calls, from Iris's flow check C544 (HAL-15117); the "still asks first" dropped once a fenced CLI run answers the calls, from Nina's check C607 (HAL-15661)

When the trust check shows an agent whose trust content holds `asks: in-sandbox`, it shall add a line under the agent's row, labelled `Without asking`, that says it will edit and run commands in its working folder, inside the sandbox; a fenced CLI run answers those calls without a person (requirement `harness-host.sandboxed-asks`). An agent without it shall get no such line. When the workspace changed since it was trusted and an agent's `asks` differs, the check shall show one Changed row for it: that the agent will edit and run commands in its working folder without asking, inside the sandbox, or that it asks again before it edits or runs a command.

## Examples

- Given a new workspace with a Claude Code agent `coder` with `asks: in-sandbox`,
  then under `coder`'s row the check shows `Without asking   will edit and run commands in its working folder, inside the sandbox`.
- Given a Claude Code agent without `asks: in-sandbox`,
  then its row has no `Without asking` line.
- Given a trusted agent `coder` that turns `asks: in-sandbox` on,
  then the check shows `coder   will edit and run commands in its working folder without asking, inside the sandbox   Changed`;
  and when it turns it off again, `coder   asks again before it edits or runs a command   Changed`.
