# assistant.build.validate-with-proposals

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U25 (Now); req-assistant revision 6 (HAL-110, HAL-1102); flow-assistant 3.7 (HAL-647); HAL-16790

When the model calls `validate`, the Build chat shall check the workspace as it is saved, changes to review included, and return each error and warning as "<severity> <path>: <message>", or "No problems.".

## Examples

- Given a change to review in `hubs/support/agents/sorter.agent.yaml` without a `name`,
  when the model calls `validate`,
  then the result has an `error` line for that file.
- Given every change to review is valid,
  when the model calls `validate`,
  then the result is "No problems.".
