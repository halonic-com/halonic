# paperclip.task-effort-guard

- Status: active
- Since: unreleased
- Source: HAL-16876; Chief's conditions on HAL-16866 (point 3, the guard), 23 Nov

When a task's `assigneeAdapterOverrides.adapterConfig.effort` changes, or a task is created with one, and the Agent tools plugin didn't write that value, the plugin shall log the task's identifier, the old and new effort and the type of actor that changed it, as an error when an agent changed it and as a warning otherwise, and save the `task_effort.foreign_change` metric with the actor type and whether the effort was set, raised, lowered or removed, whether or not the board's switch lets it write; from then on it shall write no effort on that task, and it shall also write none on a task that already has an effort it didn't write. It shall put no task text in a log line or a metric, and show an effort that isn't one of Paperclip's words as `other`.

## Examples

- Given a task whose effort the plugin set to `low`,
  when an agent changes it to `max`,
  then the plugin logs an error naming the task, `low`, `max` and `agent`, saves `task_effort.foreign_change` with `direction: raised` and `actorType: agent`, and sets no effort on that task again, even when its tags change.
- Given a task a person creates with effort `high` and the tag `D1`,
  when the plugin handles its `issue.created`,
  then it logs a warning, saves `task_effort.foreign_change` with `direction: set`, and leaves `high` in place.
- Given a task that had effort `high` before the plugin started watching, tagged `D2`,
  when it changes,
  then the plugin writes nothing and reports nothing.
- Given a task whose effort the plugin set,
  when its own change comes back as `issue.updated`,
  then the plugin reports nothing.
