# paperclip.task-tools

- Status: active
- Since: unreleased
- Source: HAL-16403, B2 in the tools plan on HAL-15920 (lever L6 of the part 1 plan): Paperclip API calls by curl are about 15% of seat tokens

When an agent calls `comment(task, body)`, the Agent tools plugin shall post the body on the task with the calling agent as its author, and shall change nothing else about the task. It shall answer with an error, and read or write nothing, for a task that isn't an identifier or an id, or an empty comment or one longer than 20,000 characters; and shall answer with an error for a task the plugin can't find. Each call shall be saved as a `tools.calls` metric tagged with the tool and whether it answered or failed. (`task_get` moved to the workspace plugin, HAL-17968.)

## Examples

- Given Tomas calls `comment` with task "HAL-16403" and body "PR #5500 is out of draft.",
  when the tool answers,
  then the comment is on HAL-16403 with Tomas as its author, and the task's status, holder and monitor are as before.
- Given task "16403", or a comment of 20,001 characters,
  when an agent calls the tool,
  then it answers with an error naming the expected form and reads or posts nothing.
- Given an agent that calls `comment` on HAL-16403 and then on a task that doesn't exist,
  when both answer,
  then the plugin saves one `ok` and one `error` call for `comment`.
