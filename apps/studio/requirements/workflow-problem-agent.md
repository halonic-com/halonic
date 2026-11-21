# studio.workflow-problem-agent

- Status: draft
- Since: unreleased
- Source: HAL-12412 (UX check S7 of HAL-12390); `studio.workspace-workflows`; `workflows.start.start-run`

The desktop app shall give each problem of a workflow that comes from the file of an agent one of its steps names with that agent's id and name, so the workflow page can name the agent and open its page. A problem whose check is `unknown-model-alias` shall also have the alias the agent names that the workspace doesn't have, the agent's own `model` or a method's, as the check points at it. A problem in the workflow's own file shall have neither.

## Examples

- Given the agent Writer with `model: smrt` and a method `short` with `model: tiny`, neither in `models.yaml`, and a workflow whose step runs Writer,
  when the workflow's Configuration is read,
  then its problems hold `unknown-model-alias` for Writer with the alias `smrt`, and another with the alias `tiny`.
- Given a workflow with a problem in its own file,
  when its Configuration is read,
  then that problem names no agent and no alias.
