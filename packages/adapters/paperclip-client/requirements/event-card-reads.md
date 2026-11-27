# paperclip-client.event-card-reads

- Status: active
- Since: unreleased
- Source: task HAL-20614: the installed-app click test of HAL-19002 found a new card missing from the Inbox until a restart; Paperclip sends a new card's live event before it moves the task's `updatedAt`

When a live event of the connection's company names a task (an `activity.logged` event on an `issue`), the Paperclip provider shall read that task's cards again on its next Inbox list, whatever the task's `updatedAt` says, if the task is in its open-task list then. It shall read them again only once per such event. When that list fails, the provider shall read the task's cards again on the list after it. An event on anything other than a task shall name no task. The event shall only name the task: its cards shall be read over the normal routes.

## Examples

- Given a task whose cards the provider read,
  when a live event names the task for a new card while Paperclip still gives the task's old `updatedAt`,
  then the next Inbox list shows the new card.
- Given a task a live event named,
  when the provider lists the Inbox twice with no new event,
  then it reads the task's cards once.
- Given an event on an approval or an agent,
  when the provider lists the Inbox,
  then it reads no task's cards because of that event.
