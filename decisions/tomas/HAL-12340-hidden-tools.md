# Decision: tools that tools.allow hides are left out of review, run notices and --all

- Task: HAL-12340
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12340 (found in Kim's docs check on HAL-12334, P2; fixes the commands to match what the connector file already says, team decision, HAL-2282 rule; the warning's words follow the validator's `approved-tool-not-allowed` warning; Liam's code review)
- Kind: user-visible

## What changes

A connector file's `tools.allow` decides which of its server's tools agents are offered. Before,
only `halonic tools approve --all` respected it:

- `halonic tools review <source>` and Studio's review screen asked about every listed tool,
  including the write tools the file hides on purpose. They now show and ask only about the tools
  `allow` names, and all tools when there is no `allow`.
- After one allowed tool was approved, every `halonic run` and `halonic runs send` named all the
  hidden tools as "waiting for your approval". The engine read the connector again without `allow`
  when it made a call. The call path now uses the same `allow` as the model turn, so hidden tools
  never wait and can't be reached through a call either.
- `halonic tools approve <source> <hidden-tool>` still approves it and exits 0, so a tool can be
  approved before it is added to `allow`. It now adds the line
  "! Agents never see <tool>: the tools.allow of <source> leaves it out. To offer it, add it there."

The requirements `cli.commands.tools.review`, `cli.commands.tools.approve`,
`studio.workspace-listed-tools`, `app.listed-tool-review` and `engine.run-connector-allow` are
updated to say this, each with a new example and a test. No test was weakened or skipped.

## Why

The review and the run notices nudged people to approve write tools that the connector file hides,
and `approve` of a hidden tool said nothing while `--all` skipped it, so the commands disagreed.
Approving by name stays allowed, as `cli.commands.tools.approve` already required; the new line
only says what that approval does.

## Covers

- cli.commands.tools.review
- cli.commands.tools.approve
- studio.workspace-listed-tools
- app.listed-tool-review
- engine.run-connector-allow
