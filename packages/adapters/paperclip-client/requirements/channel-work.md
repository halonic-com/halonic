# paperclip-client.channel-work

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, section 1.2, K1 as the board approved it on HAL-17544), work lines as HAL-17514 (`wording`, k11b), Julian's security notes (HAL-17513, HAL-17540); task HAL-18120

When the person reads a channel's messages, the Paperclip provider shall also read the channel task's child tasks, and count only those a person made (the key's own user, when the provider knows it), not an agent, in the connection's company, whose description holds the provider's unquoted line naming one of the person's messages in the channel. For each such child task, the provider shall show each agent's comment on it as a message in the channel with that agent as the author, and shall put under the person's message one `passed-on` line, with `passedTo` set, for each time the task went from one agent to another, then one line for the agent holding it, its state mapped from the task's status: `backlog` or `todo` as `starting`, `in_progress` or `in_review` as `working`, `done` as `answered`, `cancelled` as `failed`, any other as `other`. Reading a channel shall make no write request: an agent's comment is never posted again. When Paperclip refuses a child task with its own error text, the `failed` line shall carry that text as its reason, on one line and cut to the port's limit.

## Examples

- Given the provider's request list,
  when the channel work row is read,
  then it is exactly `GET /api/issues/:task/activity`.
- Given the channel Engineering, where the person asked Bo and Bo commented "Build is green" on the child task,
  when its messages are listed,
  then "Build is green" is a message in Engineering with Bo as its author, and no request is a write.
- Given a child task that went from Ada to Bo, Bo to Cy and Cy to Ada,
  when its channel's messages are listed,
  then the person's message has three `passed-on` lines, to Bo, Cy and Ada, and then Ada's line.
- Given a child task that an agent made, or one without the message line,
  when its channel's messages are listed,
  then it adds no line and no message.
