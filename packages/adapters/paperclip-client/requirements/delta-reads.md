# paperclip-client.delta-reads

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201, with the maintainer's conditions (PR 2, HAL-19334)

When the Paperclip provider first reads the company's tasks, it shall read the open tasks with `view=index`, page by page in task ID order. When it reads them again, it shall read only the tasks Paperclip changed after its watermark less 30 seconds, with `view=index` and no status filter, and merge them into the list it keeps: a task that is no longer open shall leave the list, and a task read again shall replace the copy kept before. The watermark shall be the newest `updatedAt` Paperclip sent, never the provider's own clock, and while a read is unfinished the provider shall keep the last task ID it read, so the next page, or the next read after a failed page, starts after that ID. When the provider reads a chat's messages again, it shall read only the comments after those it keeps, and shall read the newest page whole when the comments it keeps are no longer where it left them.

## Examples

- Given the first read listed a task as open, when that task closes and the provider reads again,
  then the task is no longer in the list.
- Given more tasks with the same `updatedAt` than fit on one page, when the provider reads again,
  then the read ends after one pass and reads each of those tasks once.
- Given nothing changed, when the provider reads again,
  then it makes exactly one request.
- Given a chat read once, when an agent replies and the chat is read again,
  then the provider reads only the comments after the ones it keeps.
