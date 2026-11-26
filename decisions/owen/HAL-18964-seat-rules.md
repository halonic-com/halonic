# Decision: read-only seat rules and project budgets in the Paperclip tool actions

- Task: HAL-18964, plan HAL-17960 PR 1
- Approval: Liam approved the plan with conditions on HAL-18963 and `projects.read` (read-only, cut by `paperclipAccess`) on HAL-18967; Liam signs this note in his review of https://github.com/halonic-com/halonic/pull/6276
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:j1MjtEsrU0rWrhn2ZmcPQUxgXrJY1qLZcbz2LdRrLyisy9qKERFADrjjt3RZQJ5yN8286abtcxZuadyA+m7IDg==

## What changes

`paperclip.budgets` takes an optional `projects` setting (each project's monthly budget by url
key, at most 500, default none) and answers an `Agents:` and a `Projects:` section. A project
whose Paperclip budget isn't monthly is flagged instead of compared. When Paperclip's agent or
project list returns 500 items, its limit, the section says the rest are missing. The action
now also reads `projects.read`, used only to list projects.

A new read-only action, `paperclip.seat-rules`, lists each agent's seat rule as the workspace
states it. The setting takes only `seat` (`shared`, `pinned` or `own-seat`) and an optional
`paidApi: never`; a seat name, an email or a connection id is refused with an error that says
those stay in the seats plugin's board-only settings. It needs only `agents.read`.

The two schema files are regenerated from the format for the new settings; the format's list
of actions grows from eleven to twelve. Nothing writes to Paperclip.

## Covers

- format.tool-actions
- runtime.paperclip-budgets
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
