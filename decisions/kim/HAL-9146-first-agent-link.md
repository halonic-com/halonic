# Decision: init's first-agent link points at the approval-step recipe

- Task: HAL-9146 (first-hour walk gap A1, HAL-9135)
- Approval: Liam approved halonic#2630 on HAL-9154 (14 Nov), small wording that builds on the approved init screen, a team decision with no board card (HAL-2282 rule); Liam signs this note as the CTO
- Kind: internal

The last `Next:` line of a plain `halonic init` now says "Add your first agent: https://docs.halonic.dev/examples/approval-step" instead of linking the agent-with-a-tool example. The requirement `cli.commands.init.create-workspace`, its golden output and its tests change to match. The README says the same and keeps agent-with-a-tool as the next step, "give it a tool".

Why: the approval-step recipe makes an agent with no connector and no trust step, so a new user gets a working agent in the first hour before they set up a tool. Only the docs link changes. The command does the same thing, and the recipe page is live on docs.halonic.dev (website#326).

## Covers

- cli.commands.init.create-workspace
- apps/cli/src/commands/init/golden/created.txt
