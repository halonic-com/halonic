# paperclip-client.delta-reads

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201, with the maintainer's conditions (PR 2, HAL-19334)

When the Paperclip provider first reads the company's tasks, it shall read the open tasks with `view=index`, page by page in task ID order, and shall read whole only the tasks that may be channels, whose members line is in the description that view leaves out, and those only again when their `updatedAt` changed. When it reads them again, it shall read only the tasks Paperclip changed after its watermark less 30 seconds, with `view=index` and no status filter, and merge them into the list it keeps: a task that is no longer open shall leave the list, and a task read again shall replace the copy kept before. The provider shall load the open tasks whole again on one read in 10 and replace the list, so a task that leaves Paperclip's list without changing also leaves. The watermark shall be the newest `updatedAt` on a read's first page, never the provider's own clock, and while a read is unfinished the provider shall keep the last task ID it read, so the next page, or the next read after a failed page, starts after that ID. If Paperclip refuses `view=index` as a bad request, the provider shall read the open tasks as one plain page on every read instead. When the provider reads a chat's messages again, it shall read the newest comment it keeps and the comments after it, and shall read the newest page whole when that comment is gone, and on one read in 10.

## Examples

- Given the first read listed a task as open, when that task closes and the provider reads again,
  then the task is no longer in the list.
- Given more tasks with the same `updatedAt` than fit on one page, when the provider reads again,
  then the read ends after one pass and reads each of those tasks once.
- Given nothing changed, when the provider reads again,
  then it makes exactly one request.
- Given a chat read once, when an agent replies and the chat is read again,
  then the provider reads only the newest comment it keeps and the ones after it.
- Given a task that changes on the first page while a later page is read, when the provider
  reads again, then it reads that change.
