# paperclip.task-effort-writes

- Status: active
- Since: unreleased
- Source: HAL-16876; the effort decision note on HAL-16866, steps 2 and 3

When a task assigned to an agent is created or changes and the task effort table's answer differs from the task's effort, which is unset or the plugin's own, the Agent tools plugin shall send one `PATCH` of that task's `assigneeAdapterOverrides` to Paperclip's API at the address in its settings, with the settings' key, that sets `adapterConfig.effort` to the answer (or takes the plugin's own effort off when the table answers nothing) and keeps every other override, such as the task's model; it shall send it only while the board's switch allows the running version to write and both the address and the key are set, and otherwise log "would set" with the task and the effort; it shall count a task as sent back when it moves from a reviewer in its settings to another agent and that reviewer's newest comment on the task isn't a signed approval ("approved on head"); and it shall handle the events of one task one after another.

## Examples

- Given a new task tagged `D2`, assigned to Mateo, with the model override `claude-sonnet-5-5`, and the switch on,
  when the plugin handles its `issue.created`,
  then it sends one `PATCH` whose body is `{"assigneeAdapterOverrides":{"adapterConfig":{"model":"claude-sonnet-5-5","effort":"low"}}}` with the key as a bearer token, and saves `task_effort.set`.
- Given the same task and the switch empty or set to another version,
  when the plugin handles it,
  then it sends nothing, logs "would set HAL-… to low (switch off)" and saves `task_effort.logged`.
- Given a task tagged `D3` whose effort the plugin set to `low`, handed back by Liam whose newest comment asks for changes,
  when the plugin handles its `issue.updated`,
  then it sets the effort to `high`; when Liam's newest comment reads "Liam: approved on head `abc1234`", it leaves `low`.
- Given a task whose effort the plugin set to `low`,
  when its `D2` tag is taken off,
  then the plugin takes its effort off again.
- Given a task with no assignee or one assigned to a person,
  when it changes,
  then the plugin sends nothing.
- Given Paperclip's API answers 403,
  when the plugin sends a task change,
  then it logs an error with `http_403`, saves `task_effort.failed`, and tries again on the task's next change.
