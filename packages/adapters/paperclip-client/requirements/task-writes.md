# paperclip-client.task-writes

- Status: active
- Since: unreleased
- Source: phase 3 plan (HAL-17450, rev 5, "Phase 1 and 2: what this reuses"); task HAL-17975

The Paperclip provider shall give workflows two task writes, each one row of its fixed request list on `PATCH /api/issues/{task}`: wake, which assigns the task to an agent with status `todo` and a comment, and done, which sets status `done` with a comment. Each row shall pin its body to exactly its fields (`assigneeAgentId`, `status` and `comment` for wake; `status` and `comment` for done), each a non-empty string, and to its one status, and the client shall send nothing for any other body. Before a write, the provider shall read the task with `GET /api/issues/{task}` and write only to a task of the connection's company. A write shall be sent once or refused, never queued: offline it is refused with `offline`.

## Examples

- Given the provider's request list,
  when its task write rows are read,
  then they are exactly `GET /api/issues/:task` and the two `PATCH /api/issues/:task` rows, wake pinned to status `todo` and done to status `done`.
- Given a task of the connection's company,
  when a workflow wakes agent Ada on it with a comment,
  then the provider sends `{ assigneeAgentId, status: "todo", comment }` and nothing else, and says the task is now `todo`.
- Given a done write that also sets a title, or sets status `cancelled`,
  when it reaches the transport,
  then it is refused and nothing goes out.
- Given a task of another company,
  when a workflow marks it done,
  then the provider answers `not-found` and sends no write.
