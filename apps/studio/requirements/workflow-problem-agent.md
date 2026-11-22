# studio.workflow-problem-agent

- Status: draft
- Since: unreleased
- Source: HAL-12412 (UX check S7 of HAL-12390); HAL-15639 (C605 #3); `studio.workspace-workflows`; `workflows.start.start-run`

The desktop app shall give each problem of a workflow that comes from the file of an agent one of its steps names with that agent's id and name, so the workflow page can name the agent and open its page. A problem whose check is `unknown-model-alias` shall also have that alias; one on a method's `model` (an agent step) shall also have the agent step's name, because that model can't be changed on the agent's page, so the page points to Models instead. A problem in the workflow's own file shall have neither.

## Examples

- Given the agent Writer with `model: smrt` and a method `short` with `model: tiny`, neither in `models.yaml`, and a workflow whose step runs Writer,
  when the workflow's Configuration is read,
  then its problems hold `unknown-model-alias` for Writer with the alias `smrt` and no agent step, and another for Writer with the alias `tiny` and the agent step `short`.
- Given a workflow with a problem in its own file,
  when its Configuration is read,
  then that problem names no agent and no alias.
