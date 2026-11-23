# assistant.build.proposals-change-nothing

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U25 (Now); req-assistant revision 6 (HAL-110, HAL-1102); flow-assistant 3.1 (HAL-647); AI changes 1.1 (HAL-3228); HAL-3247; HAL-16790

When the model calls `propose_file` or `propose_delete`, the Build chat shall write the change into the workspace at once through the review service, as a change to review on the card of that tool call, and only if the file still holds what the model last read or wrote in this chat; a file the model never read may only be created.

## Examples

- Given a Build chat in workspace "acme",
  when the model calls `propose_file` with path `skills/tone/SKILL.md`, the whole file as `content` and why "A tone skill",
  then `skills/tone/SKILL.md` is saved in the workspace, it is a change to review,
  and the tool result is "Changed skills/tone/SKILL.md. The person reviews the change and accepts or rejects it; until then it's marked as yours to review."
- Given the model read `hubs/sales/agents/old.agent.yaml`,
  when it calls `propose_delete` for it,
  then the file moves to the trash at once, as a change to review, and the result starts "Deleted hubs/sales/agents/old.agent.yaml.".
- Given the model calls `propose_delete` for `hubs/sales/agents/old.agent.yaml`, which doesn't exist,
  then the tool result is "Error: hubs/sales/agents/old.agent.yaml does not exist" and nothing is written.
- Given the model last read `hubs/sales/workflows/triage.workflow.yaml` and the person typed in it since,
  when the model calls `propose_file` on it,
  then nothing is written and the tool result is "The file changed since you read it. Read it again, then make your change."
- Given the model never read `hubs/sales/workflows/triage.workflow.yaml`, which exists,
  when it calls `propose_file` on it,
  then nothing is written and the tool result is "Read hubs/sales/workflows/triage.workflow.yaml first, then make your change."
