# paperclip-client.board-tasks

- Status: active
- Since: unreleased
- Source: HAL-19491 (board approved Sofia's proposal, row "task", 26 Nov); plan HAL-19667; task HAL-19668

When an open task's `assigneeUserId` is the signed-in user's ID, the Paperclip provider shall list it in the inbox as one item of kind `task`: from the agent that made the task (`createdByAgentId`), or from the person who made it when no agent did; its question the task's title, then the first three lines of its description that hold text, with "…" when the description goes on; with the task's project, no options, and the task's page in Paperclip as both its `answerElsewhere` link and its `webLink`. The provider shall decide this from `assigneeUserId` alone, never from the task's text. Because the task list's index view leaves out the description, the provider shall read a task assigned to a person whole, and again only when it changes.

The provider shall list no `task` item for a task assigned to another person or to an agent, for a closed task, for a chat or a channel, or while it doesn't know the signed-in user's ID. While a card or an approval on the task waits on the person, the provider shall list only that item for the task, so nothing shows twice. Without a web link for the task, such as on a connection that isn't `https`, there is nowhere to answer it, so the provider shall list no `task` item for it.

## Examples

- Given Acme's task ACME-9 "Choose the launch photos", made by Ada and assigned to the signed-in person,
  when the inbox is read,
  then it holds one item of kind `task` from Ada, answered at ACME-9's page in Paperclip.
- Given that a confirmation card on the task waits on the person,
  when the inbox is read,
  then it holds the card's item and no `task` item.
- Given a task assigned to Sam, a closed task, a chat and a channel,
  when the inbox is read,
  then it holds no `task` item.
- Given a connection whose key names no user,
  when the inbox is read,
  then it holds no `task` item.
