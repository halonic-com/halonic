# Decision: Studio's review leaves out the tools tools.allow hides, and approve says when it approved one

- Task: HAL-12340
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12340 (found in Kim's docs check on HAL-12334, P2; fixes the commands to match what the connector file already says, team decision, HAL-2282 rule; the warning's words follow the validator's `approved-tool-not-allowed` warning; Liam's code review)
- Kind: user-visible

## What changes

A connector file's `tools.allow` decides which of its server's tools agents are offered. HAL-13288
already keeps `halonic tools review` and the run notices to the allowed tools. This change does the
rest:

- Studio's review screen asked about every listed tool, including the write tools the file hides on
  purpose. It now shows and asks only about the tools `allow` names, and all tools when there is no
  `allow`. The filter is `allowedToolsCheck` in `@halonicjs/app`, which the CLI's `isOffered` shares.
- `halonic tools approve <source> <hidden-tool>` still approves it and exits 0, so a tool can be
  approved before it is added to `allow`. It now adds the line
  "! Agents never see <tool>: the tools.allow of <source> leaves it out. To offer it, add it there."

The requirements `cli.commands.tools.approve`, `studio.workspace-listed-tools` and
`app.listed-tool-review` are updated to say this, each with a new example and a test. No test was
weakened or skipped.

## Why

The review and the run notices nudged people to approve write tools that the connector file hides,
and `approve` of a hidden tool said nothing while `--all` skipped it, so the commands disagreed.
Approving by name stays allowed, as `cli.commands.tools.approve` already required; the new line
only says what that approval does.

## Covers

- cli.commands.tools.approve
- studio.workspace-listed-tools
- app.listed-tool-review
