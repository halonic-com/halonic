# paperclip.task-next-step

- Status: active
- Since: unreleased
- Source: HAL-16403, B2 in the tools plan on HAL-15920 (lever L6 of the part 1 plan); how the tools write is Liam's decision B on HAL-16988

When an agent calls `set_next_step(task, status, comment, monitor?, blockedBy?)` or `finish_run(task, outcome, comment, to?, blockedBy?)`, the Agent tools plugin shall send the change and the comment in one call to the host method `issues.setDisposition`, which makes it through Paperclip's own task update route as the calling agent's run, and shall answer with the task's new status and next monitor check, or with the route's status, code and message when Paperclip refuses. `set_next_step` shall accept only `in_progress` with a monitor (15 to 1,440 minutes, 1 to 8 checks, 4 by default) or `blocked` with 1 to 10 blocking tasks, and shall refuse any handoff. `finish_run` shall accept `done`, `handoff` to another agent named by name or url key (status `todo`), or `blocked` with 1 to 10 blocking tasks. A handoff or a block shall clear the task's monitor when it has one. Either tool shall answer with an error, and send nothing, for parameters outside these rules, an empty comment or one longer than 20,000 characters, a task or blocker the plugin can't find, an agent it can't find, or a handoff to the calling agent. Each call shall be saved as a `tools.calls` metric tagged with the tool and whether it answered or failed.

## Examples

- Given Tomas runs on HAL-16403 and pushed a branch at 14:00,
  when Tomas calls `set_next_step` with status "in_progress", monitor { inMinutes: 20, ref: "halonic-com/halonic#5486" } and a comment,
  then the plugin sends status `in_progress`, the comment and a monitor at 14:20 with 4 checks for that ref, and answers with the next check Paperclip stored.
- Given Tomas calls `set_next_step` with status "in_progress" and no monitor, or with "todo", or with a `to`,
  when the tool answers,
  then it is an error that names what to send instead, and nothing reaches Paperclip.
- Given HAL-16403 has a monitor,
  when Tomas calls `finish_run` with outcome "handoff", to "Liam" and a comment,
  then the plugin sends status `todo`, Liam's agent id, the comment and a cleared monitor.
- Given Tomas calls `finish_run` with outcome "blocked" and blockedBy ["HAL-16989"],
  when the tool answers,
  then the plugin sent status `blocked` with HAL-16989's task id as the blocker.
- Given Paperclip answers 422 `invalid_issue_disposition`,
  when the tool answers,
  then the error carries the status 422, the code and Paperclip's message.
- Given Tomas calls `finish_run` with outcome "handoff" to "Tomas",
  when the tool answers,
  then it is an error that says the task is already with the caller, and nothing reaches Paperclip.
