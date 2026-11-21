# cli.trust-check-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam; the wording is the team's call on HAL-14992, on the approved trust check

When the trust check shows an agent whose trust content holds `asks: in-sandbox`, it shall add a line under the agent's row, labelled `Without asking`, that says it edits and runs commands in its working folder, inside the sandbox. An agent without it shall get no such line. When the workspace changed since it was trusted and an agent's `asks` differs, the check shall show one Changed row for it: that the agent now edits and runs commands in its working folder without asking, or that it asks again before it edits or runs a command.

## Examples

- Given a new workspace with a Claude Code agent `coder` with `asks: in-sandbox`,
  then under `coder`'s row the check shows `Without asking   edits and runs commands in its working folder, inside the sandbox`.
- Given a Claude Code agent without `asks: in-sandbox`,
  then its row has no `Without asking` line.
- Given a trusted agent `coder` that turns `asks: in-sandbox` on,
  then the check shows `coder   now edits and runs commands in its working folder without asking   Changed`;
  and when it turns it off again, `coder   asks again before it edits or runs a command   Changed`.
