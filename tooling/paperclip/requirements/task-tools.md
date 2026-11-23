# paperclip.task-tools

- Status: active
- Since: unreleased
- Source: HAL-16403, B2 in the tools plan on HAL-15920 (lever L6 of the part 1 plan): Paperclip API calls by curl are about 15% of seat tokens

When an agent calls `task_get(task, comments?, document?)` with a task's identifier or id, the Agent tools plugin shall answer in one call with the task's title, status, priority, holder, parent and blockers with their statuses, next monitor check, description, documents and its newest comments (5 unless the agent asks for 0 to 20), oldest first, each with its author's name and time, and the asked document's text, trimming the description to 4,000, each comment to 2,000 and the document to 20,000 characters and saying how much it left out. When an agent calls `comment(task, body)`, the plugin shall post the body on the task with the calling agent as its author, and shall change nothing else about the task. Either tool shall answer with an error, and read or write nothing, for a task that isn't an identifier or an id, a comment count outside 0 to 20, or an empty comment or one longer than 20,000 characters; and shall answer with an error for a task the plugin can't find. Each call shall be saved as a `tools.calls` metric tagged with the tool and whether it answered or failed.

## Examples

- Given HAL-16403, held by Tomas, blocked by HAL-16194 (done), with a `plan` document and 7 comments,
  when an agent calls `task_get` with task "HAL-16403",
  then it answers with the task's head line, "Blocked by: HAL-16194 (done)", the `plan` document in the list, and the newest 5 of the 7 comments, oldest first, each with its author and time.
- Given a comment of 2,500 characters on HAL-16403,
  when an agent calls `task_get` for it,
  then the comment's text ends after 2,000 characters with "[… 500 more characters left out]".
- Given an agent that calls `task_get` with document "plan",
  when the task has that document,
  then the answer carries the document's text; and when it hasn't, the answer says the document doesn't exist on this task.
- Given Tomas calls `comment` with task "HAL-16403" and body "PR #5500 is out of draft.",
  when the tool answers,
  then the comment is on HAL-16403 with Tomas as its author, and the task's status, holder and monitor are as before.
- Given task "16403", comments 21, or a comment of 20,001 characters,
  when an agent calls the tool,
  then it answers with an error naming the expected form and reads or posts nothing.
- Given an agent that calls `task_get` and then `comment` on a task that doesn't exist,
  when both answer,
  then the plugin saves one `ok` call for `task_get` and one `error` call for `comment`.
