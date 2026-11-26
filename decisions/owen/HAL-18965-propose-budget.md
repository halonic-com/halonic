# Decision: budget proposals in the Paperclip tool actions, dry run only

- Task: HAL-18965, plan HAL-17960 PR 2
- Approval: Liam approved the plan with conditions on HAL-18963; `approvals.read` (read-only, cut by `paperclipAccess`) asked on HAL-20034; the gap that a plugin can't file an approval goes to the board through Chief on HAL-20033. Liam signs this note in his review, Julian gives his OK on the new action
- Kind: internal

## What changes

A new action, `paperclip.propose-budget`, compares each agent's and project's monthly budget
in the tool file with Paperclip's, as `paperclip.budgets` does, and lists the budget approval it
would ask the board for wherever they differ: the agent or project, the old and new amounts,
the tool file (`library/tools/<id>.tool.yaml`) and the full workspace commit. A budget with a
pending `budget_override_required` approval for that agent or project is reported and gets no
second proposal. When it can't read the pending approvals, it proposes nothing.

Paperclip's plugin SDK (2026.1117.0) can list, read and decide approvals but not file one, and
its only budget approval type is the one Paperclip opens itself at a budget stop. So, per the
plan's condition, the action stops at the dry run: it has no write capability, the format marks
it as not writing, and `mode: write` answers that it can't file and files nothing. The `mode`
setting stays so that turning filing on later is the tool file's step, taken by the board.

The runtime's host gains a read-only `approvals.list` (`approvals.read`); `paperclipAccess`
gives it only to an action that declares it and always for the call's company. There is no
`approvals.decide`. Each action call now also carries the served snapshot's workspace commit.
The two schema files are regenerated for the new action; the list grows from twelve to thirteen.

## Covers

- format.tool-actions
- runtime.paperclip-propose-budget
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
