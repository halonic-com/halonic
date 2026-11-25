# runtime.paperclip-task

- Status: active
- Since: unreleased
- Source: HAL-18148, step 1b of the phase 3 plan on HAL-17450 (rev 5, "Generic actions, company settings"): `task_get` moves from `tooling/paperclip` into the runtime with the same answer, refusals and limits

When a tool runs `paperclip.task`, the runtime shall read the task the agent names, by identifier or id, through Paperclip's own read clients only, and answer its title, status, priority, holder, parent, blockers, monitor, description, documents, the document asked for and its newest comments, oldest first, in the same text as `task_get`, with the description cut at 4,000 characters, each comment at 2,000 and the document at 20,000, saying how much it left out, and with `data` holding only what the text shows; it shall show 5 comments unless the agent asks for 0 to 20, refuse a `task` that isn't an identifier or an id, a `comments` outside 0 to 20 and a `document` that isn't a key before it reads anything, and say so when the task isn't there or Paperclip refuses a read.

## Examples

- Given HAL-16403 with 7 comments,
  when Tomas calls `task_get` for it,
  then the answer shows the newest 5, oldest first, under "Comments: the newest 5 of 7, oldest first."
- Given a comment of 2,500 characters,
  when the agent reads the task,
  then the answer shows its first 2,000 and "[… 500 more characters left out]".
- Given `comments: 21`,
  when the agent calls the tool,
  then it answers "comments must be a whole number from 0 to 20." and reads nothing.
