# runtime.paperclip-propose-budget

- Status: active
- Since: unreleased
- Source: HAL-18965 (plan HAL-17960 PR 2, approved with conditions on HAL-18963); `approvals.read` asked on HAL-20034; the gap that a plugin can't file an approval on HAL-20033

When a tool runs `paperclip.propose-budget`, the runtime shall read the company's agents, projects and pending approvals from Paperclip and compare each agent's and project's monthly budget with the one the tool's `agents` or `projects` setting gives it, as `paperclip.budgets` does. For every agent or project Paperclip lists whose budget differs or that has none, it shall answer one proposal naming the agent or project, its old and new amount in dollars, and the tool file (`library/tools/<id>.tool.yaml`) and the full workspace commit the new amount comes from. When a pending approval of type `budget_override_required` names that agent or project (`scopeType` and `scopeId` in its payload), it shall report that approval and propose nothing for it. Its first line shall say it is a dry run. Paperclip's plugin SDK can't file an approval, so with `mode: write` it shall file nothing either and say so. When it can't read the agents, projects or pending approvals, it shall answer an error and propose nothing. It shall change nothing in Paperclip and ask for no capability beyond `agents.read`, `projects.read` and `approvals.read`.

## Examples

- Given the workspace sets Mateo $50, Nina $25, Ravi $30 and the website $80, and Paperclip has Mateo at 4000 cents, Nina with none, Ravi at 3000 and the website at 6000,
  when an agent calls the tool,
  then it answers a dry run with three proposals: Mateo $40.00 to $50.00, Nina none to $25.00 and the website $60.00 to $80.00, each from `library/tools/propose-budget.tool.yaml` at the snapshot's commit, and nothing is written.
- Given a pending `budget_override_required` approval for Mateo,
  when an agent calls the tool,
  then Mateo's line names that approval as already pending and Mateo has no proposal.
- Given an approval of another type, another status, or for another agent,
  when an agent calls the tool,
  then it doesn't count as a duplicate.
- Given the tool file sets `mode: write`,
  when an agent calls the tool,
  then it answers that Paperclip can't file a budget approval yet, and nothing is written.
- Given Paperclip refuses the approval list,
  when an agent calls the tool,
  then it answers an error and proposes nothing.
